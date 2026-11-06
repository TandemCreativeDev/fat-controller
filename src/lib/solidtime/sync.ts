import "server-only"

import { and, gte, lt, min, notInArray, sql } from "drizzle-orm"
import type { z } from "zod"

import { db } from "@/db"
import {
  solidtimeMember,
  solidtimeProject,
  solidtimeTimeEntry,
} from "@/db/schema"
import { env } from "@/env"
import { londonDate } from "@/lib/forecast"
import { getSettings, saveSystemSetting } from "@/lib/settings-store"
import {
  apiTokensSchema,
  assertCompleteFetch,
  mapTimeEntry,
  memberPageSchema,
  projectPageSchema,
  soonestExpiry,
  solidtimeInstant,
  syncWindow,
  timeEntryPageSchema,
} from "./records"

const PAGE_SIZE = 500
const WRITE_BATCH = 500

export function solidtimeConfigured(): boolean {
  return Boolean(
    env.SOLIDTIME_API_URL &&
    env.SOLIDTIME_API_TOKEN &&
    env.SOLIDTIME_ORGANIZATION_ID
  )
}

/** Accepts the site's address, or the address with /api/v1 on the end. */
function apiBase(): string {
  const url = env.SOLIDTIME_API_URL!.replace(/\/+$/, "")
  return url.endsWith("/api/v1") ? url : `${url}/api/v1`
}

async function get<S extends z.ZodType>(
  path: string,
  params: Record<string, string | number>,
  schema: S,
  onCall: () => void
): Promise<z.infer<S>> {
  const url = new URL(`${apiBase()}${path}`)
  for (const [k, v] of Object.entries(params))
    url.searchParams.set(k, String(v))
  onCall()
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.SOLIDTIME_API_TOKEN}`,
      Accept: "application/json",
      // Cloudflare in front of a hosted Solidtime can reject a default client.
      "User-Agent": "fat-controller",
    },
    cache: "no-store",
  })
  if (res.status === 401) throw new Error("Solidtime token expired")
  if (!res.ok) throw new Error(`Solidtime GET ${path} failed: ${res.status}`)
  return schema.parse(await res.json())
}

/** Bring members, projects, the token's expiry and time entries up to date. */
export async function syncSolidtime(): Promise<{
  rows: number
  calls: number
}> {
  let calls = 0
  const count = () => calls++
  const org = `/organizations/${env.SOLIDTIME_ORGANIZATION_ID}`

  const tokens = await get("/users/me/api-tokens", {}, apiTokensSchema, count)
  await saveSystemSetting(
    "solidtime_token_expires_at",
    soonestExpiry(tokens.data)
  )

  const members: z.infer<typeof memberPageSchema>["data"] = []
  for (let page = 1; ; page++) {
    const body = await get(`${org}/members`, { page }, memberPageSchema, count)
    members.push(...body.data)
    if (page >= (body.meta?.last_page ?? 1) || body.data.length === 0) break
  }
  const projects: z.infer<typeof projectPageSchema>["data"] = []
  for (let page = 1; ; page++) {
    const body = await get(
      `${org}/projects`,
      { page },
      projectPageSchema,
      count
    )
    projects.push(...body.data)
    if (page >= (body.meta?.last_page ?? 1) || body.data.length === 0) break
  }

  const [{ earliest }] = await db
    .select({ earliest: min(solidtimeTimeEntry.start) })
    .from(solidtimeTimeEntry)
  const settings = await getSettings()
  const window = syncWindow({
    today: londonDate(new Date()),
    startDate: settings.forecast_start_date,
    earliestStored: earliest ? londonDate(new Date(earliest)) : null,
  })

  // Fetch everything first: nothing is written unless the whole fetch succeeds.
  const entries: z.infer<typeof timeEntryPageSchema>["data"] = []
  const pages: { total: number; ids: string[] }[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const body = await get(
      `${org}/time-entries`,
      {
        start: solidtimeInstant(window.from),
        end: solidtimeInstant(window.to),
        type: "work",
        limit: PAGE_SIZE,
        offset,
      },
      timeEntryPageSchema,
      count
    )
    entries.push(...body.data)
    pages.push({ total: body.meta.total, ids: body.data.map((e) => e.id) })
    if (entries.length >= body.meta.total || body.data.length === 0) break
  }
  assertCompleteFetch(pages)

  await db.transaction(async (tx) => {
    for (const m of members)
      await tx
        .insert(solidtimeMember)
        .values({
          id: m.id,
          userId: m.user_id,
          name: m.name,
          role: m.role ?? null,
          isPlaceholder: m.is_placeholder ?? false,
          raw: m,
        })
        .onConflictDoUpdate({
          target: solidtimeMember.id,
          set: {
            userId: m.user_id,
            name: m.name,
            role: m.role ?? null,
            isPlaceholder: m.is_placeholder ?? false,
            raw: m,
            syncedAt: new Date(),
          },
        })
    for (const p of projects)
      await tx
        .insert(solidtimeProject)
        .values({
          id: p.id,
          name: p.name,
          isArchived: p.is_archived ?? false,
          raw: p,
        })
        .onConflictDoUpdate({
          target: solidtimeProject.id,
          set: {
            name: p.name,
            isArchived: p.is_archived ?? false,
            raw: p,
            syncedAt: new Date(),
          },
        })

    const unique = [...new Map(entries.map((e) => [e.id, e])).values()]
    for (let i = 0; i < unique.length; i += WRITE_BATCH) {
      await tx
        .insert(solidtimeTimeEntry)
        .values(unique.slice(i, i + WRITE_BATCH).map(mapTimeEntry))
        .onConflictDoUpdate({
          target: solidtimeTimeEntry.id,
          set: {
            userId: sql.raw(`excluded."user_id"`),
            projectId: sql.raw(`excluded."project_id"`),
            start: sql.raw(`excluded."start"`),
            end: sql.raw(`excluded."end"`),
            durationSeconds: sql.raw(`excluded."duration_seconds"`),
            billable: sql.raw(`excluded."billable"`),
            type: sql.raw(`excluded."type"`),
            raw: sql.raw(`excluded."raw"`),
            syncedAt: sql.raw(`excluded."synced_at"`),
          },
        })
    }
    // Solidtime deletes entries permanently, so what it no longer returns has gone.
    const inWindow = and(
      gte(solidtimeTimeEntry.start, window.from),
      lt(solidtimeTimeEntry.start, window.to)
    )
    const ids = unique.map((e) => e.id)
    await tx
      .delete(solidtimeTimeEntry)
      .where(
        ids.length
          ? and(inWindow, notInArray(solidtimeTimeEntry.id, ids))
          : inWindow
      )
  })

  return { rows: entries.length, calls }
}
