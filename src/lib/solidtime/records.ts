import { z } from "zod"

import { addDays, londonDate } from "@/lib/forecast"

/** Solidtime API responses. The API is treated as unstable: every response is validated. */

export const timeEntrySchema = z.looseObject({
  id: z.string(),
  start: z.string(),
  end: z.string().nullable(),
  duration: z.number().nullish(),
  user_id: z.string(),
  project_id: z.string().nullish(),
  billable: z.boolean().nullish(),
  type: z.string().nullish(),
})

export const timeEntryPageSchema = z.object({
  data: z.array(timeEntrySchema),
  meta: z.looseObject({ total: z.number() }),
})

export const memberSchema = z.looseObject({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  role: z.string().nullish(),
  is_placeholder: z.boolean().nullish(),
})

export const projectSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  is_archived: z.boolean().nullish(),
})

const lastPage = z.looseObject({ last_page: z.number().nullish() }).nullish()

export const memberPageSchema = z.object({
  data: z.array(memberSchema),
  meta: lastPage,
})

export const projectPageSchema = z.object({
  data: z.array(projectSchema),
  meta: lastPage,
})

export const apiTokensSchema = z.object({
  data: z.array(
    z.looseObject({
      revoked: z.boolean().nullish(),
      expires_at: z.string().nullish(),
    })
  ),
})

export function mapTimeEntry(e: z.infer<typeof timeEntrySchema>) {
  return {
    id: e.id,
    userId: e.user_id,
    projectId: e.project_id ?? null,
    start: new Date(e.start),
    end: e.end ? new Date(e.end) : null,
    // A running timer's duration is 0; it's found by its missing end, not this.
    durationSeconds: e.duration ?? 0,
    billable: e.billable ?? false,
    type: e.type ?? null,
    raw: e,
    syncedAt: new Date(),
  }
}

/**
 * The earliest expiry among live tokens. Solidtime doesn't say which token made
 * the request, so warning on the soonest is the safe choice.
 */
export function soonestExpiry(
  tokens: z.infer<typeof apiTokensSchema>["data"]
): string | null {
  const live = tokens
    .filter((t) => !t.revoked && t.expires_at)
    .map((t) => t.expires_at!)
    .sort()
  return live[0] ?? null
}

/** The UTC instant of midnight at the start of a London date. */
export function londonMidnight(date: string): Date {
  // Midnight UTC falls on the same London date or the hour after; try both offsets.
  for (const hours of [0, -1]) {
    const candidate = new Date(`${date}T00:00:00Z`)
    candidate.setUTCHours(hours)
    if (
      londonDate(candidate) === date &&
      londonDate(new Date(candidate.getTime() - 1)) !== date
    )
      return candidate
  }
  return new Date(`${date}T00:00:00Z`)
}

/** Solidtime wants `YYYY-MM-DDTHH:mm:ssZ`, with no milliseconds. */
export const solidtimeInstant = (d: Date) =>
  d.toISOString().replace(/\.\d{3}Z$/, "Z")

/**
 * The window to replace: a rolling 90 days, ending at tomorrow's London midnight.
 * It reaches back further whenever nothing is stored from the forecast's start date:
 * the first sync, or a start date moved earlier. With no start date set yet, it
 * fetches everything, so a date chosen later still has its hours.
 */
export function syncWindow(args: {
  today: string
  startDate: string | null
  earliestStored: string | null
}): { from: Date; to: Date } {
  const rolling = addDays(args.today, -90)
  const backfillTo = args.startDate ?? "2000-01-01"
  const needsBackfill =
    args.earliestStored === null ||
    (args.startDate !== null && args.earliestStored > args.startDate)
  const from = needsBackfill && backfillTo < rolling ? backfillTo : rolling
  return {
    from: londonMidnight(from),
    to: londonMidnight(addDays(args.today, 1)),
  }
}

/** Throws unless the pages make up a complete, consistent fetch. */
export function assertCompleteFetch(
  pages: { total: number; ids: string[] }[]
): void {
  const totals = new Set(pages.map((p) => p.total))
  if (totals.size > 1)
    throw new Error("Solidtime's entry total changed during the fetch")
  const total = pages[0]?.total ?? 0
  const unique = new Set(pages.flatMap((p) => p.ids)).size
  if (unique !== total)
    throw new Error(
      `Solidtime returned ${unique} entries but reported ${total}; nothing was changed`
    )
}
