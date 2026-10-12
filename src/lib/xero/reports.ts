import "server-only"

import { and, eq, gt, isNull } from "drizzle-orm"

import { db } from "@/db"
import {
  accountGroup,
  syncRun,
  xeroAccount,
  xeroPnlLine,
  xeroReportSnapshot,
} from "@/db/schema"
import { defaultGroup, lastMonths, parsePnlReport } from "@/lib/pnl"
import { xeroGet } from "./client"
import type { StepResult } from "./sync"

/** Months shown on the home screen: last 12 plus the current one. */
export const PNL_MONTHS = 13
/** A month's report is re-fetched once it's older than this (late entries change past months). */
const STALE_MS = 12 * 60 * 60_000

/** Today's date in London, as a UTC-midnight Date for month arithmetic. */
export function londonToday(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
  }).format(now)
  return new Date(`${ymd}T00:00:00Z`)
}

/** Give every synced account without a group its default one. */
async function ensureAccountGroups() {
  const missing = await db
    .select({
      accountId: xeroAccount.accountId,
      name: xeroAccount.name,
      class: xeroAccount.class,
    })
    .from(xeroAccount)
    .leftJoin(accountGroup, eq(accountGroup.accountId, xeroAccount.accountId))
    .where(isNull(accountGroup.accountId))
  if (missing.length === 0) return
  await db
    .insert(accountGroup)
    .values(
      missing.map((a) => ({
        accountId: a.accountId,
        group: defaultGroup(a),
        source: "auto" as const,
      }))
    )
    .onConflictDoNothing()
}

/**
 * Fetch Xero's single-month Profit and Loss report for each of the last 13
 * months whose snapshot is missing or stale, and replace that month's lines.
 */
export async function syncPnlReports(
  trigger: "cron" | "manual",
  deadline: number
): Promise<StepResult> {
  const [run] = await db
    .insert(syncRun)
    .values({ trigger, resource: "pnl_report" })
    .returning({ id: syncRun.id })
  let rows = 0
  let calls = 0
  let complete = true
  let error: string | undefined

  try {
    await ensureAccountGroups()
    const fresh = new Date(Date.now() - STALE_MS)
    for (const { start, end } of lastMonths(londonToday(), PNL_MONTHS)) {
      if (Date.now() >= deadline) {
        complete = false
        break
      }
      const [recent] = await db
        .select({ id: xeroReportSnapshot.id })
        .from(xeroReportSnapshot)
        .where(
          and(
            eq(xeroReportSnapshot.report, "ProfitAndLoss"),
            eq(xeroReportSnapshot.periodStart, start),
            gt(xeroReportSnapshot.fetchedAt, fresh)
          )
        )
        .limit(1)
      if (recent) continue

      const body = await xeroGet(
        "Reports/ProfitAndLoss",
        { params: { fromDate: start, toDate: end } },
        () => calls++
      )
      const lines = parsePnlReport(body)

      await db.transaction(async (tx) => {
        await tx
          .delete(xeroReportSnapshot)
          .where(
            and(
              eq(xeroReportSnapshot.report, "ProfitAndLoss"),
              eq(xeroReportSnapshot.periodStart, start)
            )
          )
        await tx.insert(xeroReportSnapshot).values({
          report: "ProfitAndLoss",
          periodStart: start,
          periodEnd: end,
          params: { fromDate: start, toDate: end },
          raw: body as object,
        })
        await tx.delete(xeroPnlLine).where(eq(xeroPnlLine.periodStart, start))
        if (lines.length) {
          await tx
            .insert(xeroPnlLine)
            .values(lines.map((l) => ({ periodStart: start, ...l })))
        }
      })
      rows += lines.length
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    complete = false
  }

  await db
    .update(syncRun)
    .set({
      finishedAt: new Date(),
      rowsChanged: rows,
      apiCalls: calls,
      error: error ?? null,
    })
    .where(eq(syncRun.id, run.id))
  return { resource: "pnl_report", rows, calls, complete, error }
}
