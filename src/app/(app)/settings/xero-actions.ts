"use server"

import { and, desc, eq, isNotNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { syncCursor, syncRun, xeroConnection } from "@/db/schema"
import { requireDirector } from "@/lib/session"
import { runSync } from "@/lib/xero/sync"

export type SyncActionResult = {
  status: "done" | "partial" | "failed" | "busy" | "too-soon"
  message: string
}

const MANUAL_COOLDOWN_MS = 5 * 60_000

/**
 * Runs one ~45-second slice of the sync. The client calls again while the
 * result is "partial", which is how the first backfill gets through.
 */
export async function syncNow(): Promise<SyncActionResult> {
  await requireDirector()

  const midPass = await db
    .select({ r: syncCursor.resource })
    .from(syncCursor)
    .where(isNotNull(syncCursor.nextPage))
  if (midPass.length === 0) {
    const [last] = await db
      .select({ finishedAt: syncRun.finishedAt })
      .from(syncRun)
      .where(and(eq(syncRun.trigger, "manual"), isNotNull(syncRun.finishedAt)))
      .orderBy(desc(syncRun.finishedAt))
      .limit(1)
    if (
      last?.finishedAt &&
      Date.now() - last.finishedAt.getTime() < MANUAL_COOLDOWN_MS
    ) {
      return {
        status: "too-soon",
        message: "Synced in the last 5 minutes. Try again shortly.",
      }
    }
  }

  const result = await runSync("manual", 45_000)
  revalidatePath("/", "layout")
  if (result.status === "busy")
    return { status: "busy", message: "A sync is already running." }
  const rows = result.steps.reduce((n, s) => n + s.rows, 0)
  const errors = result.steps
    .filter((s) => s.error)
    .map((s) => `${s.resource}: ${s.error}`)
  if (result.status === "failed")
    return { status: "failed", message: errors.join("; ") }
  return {
    status: result.status,
    message:
      result.status === "done"
        ? `Up to date (${rows} records this run).`
        : `Synced ${rows} records so far…`,
  }
}

export async function disconnectXero() {
  await requireDirector()
  await db.delete(xeroConnection).where(eq(xeroConnection.id, "xero"))
  revalidatePath("/", "layout")
}
