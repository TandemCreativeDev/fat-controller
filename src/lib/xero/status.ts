import "server-only"

import { desc, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import { syncCursor, syncRun, xeroConnection } from "@/db/schema"

const COUNTED_TABLES = [
  ["Accounts", "xero_account"],
  ["Contacts", "xero_contact"],
  ["Invoices and bills", "xero_invoice"],
  ["Credit notes", "xero_credit_note"],
  ["Payments", "xero_payment"],
  ["Bank transactions", "xero_bank_transaction"],
  ["Manual journals", "xero_manual_journal"],
] as const

export async function getXeroStatus() {
  const [connection] = await db
    .select({
      tenantName: xeroConnection.tenantName,
      status: xeroConnection.status,
      lastError: xeroConnection.lastError,
      scopes: xeroConnection.scopes,
      connectedAt: xeroConnection.connectedAt,
      lastRefreshedAt: xeroConnection.lastRefreshedAt,
    })
    .from(xeroConnection)
    .where(eq(xeroConnection.id, "xero"))

  const cursors = await db.select().from(syncCursor)
  const recentRuns = await db
    .select()
    .from(syncRun)
    .orderBy(desc(syncRun.startedAt))
    .limit(20)

  const countSql = COUNTED_TABLES.map(
    ([, t]) => `(select count(*)::int from ${t}) as "${t}"`
  ).join(", ")
  const counts = (await db.execute(sql.raw(`select ${countSql}`)))
    .rows[0] as Record<string, number>

  const backfillDone =
    cursors.length > 0 &&
    cursors.every((c) => c.nextPage === null && c.lastCompletedAt)
  const lastCompleted = cursors.reduce<Date | null>(
    (max, c) =>
      c.lastCompletedAt && (!max || c.lastCompletedAt > max)
        ? c.lastCompletedAt
        : max,
    null
  )

  return {
    connection: connection ?? null,
    counts: COUNTED_TABLES.map(([label, t]) => ({
      label,
      count: counts[t] ?? 0,
    })),
    recentRuns,
    inProgress: cursors.some((c) => c.nextPage !== null),
    backfillDone,
    lastCompleted,
  }
}
