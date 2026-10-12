import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/db"
import { vCurrentFy, vPnlMonthly } from "@/db/schema"
import { londonToday } from "@/lib/pnl"
import { parsePeriod, resolvePeriod, type Period } from "@/lib/period"

/** The period chosen in the URL (`?period=`), resolved against today's data. */
export async function getPeriod(raw: unknown): Promise<Period> {
  const [[fy], [first]] = await Promise.all([
    db.select({ fyStart: vCurrentFy.fyStart }).from(vCurrentFy),
    db
      .select({ month: sql<string | null>`min(${vPnlMonthly.month})::text` })
      .from(vPnlMonthly),
  ])
  const today = londonToday()
  return resolvePeriod(parsePeriod(raw), {
    fyStart: fy?.fyStart ?? today.toISOString().slice(0, 10),
    firstMonth: first?.month ?? null,
    today,
  })
}
