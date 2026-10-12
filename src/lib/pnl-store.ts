import "server-only"

import { asc, sql } from "drizzle-orm"

import { db } from "@/db"
import { vPnlMonthly } from "@/db/schema"

export type PnlMonth = {
  month: string
  sales: number
  peopleCosts: number
  otherCosts: number
  profit: number
  margin: number | null
  ctSetAside: number
  asOf: Date | null
}

// numeric arrives as a string; figures are 2dp GBP, safe as JS numbers for display and charting.
export async function getPnlMonthly(): Promise<PnlMonth[]> {
  const rows = await db
    .select()
    .from(vPnlMonthly)
    .orderBy(asc(vPnlMonthly.month))
  return rows.map((r) => ({
    month: r.month,
    sales: Number(r.sales),
    peopleCosts: Number(r.peopleCosts),
    otherCosts: Number(r.otherCosts),
    profit: Number(r.profit),
    margin: r.margin === null ? null : Number(r.margin),
    ctSetAside: Number(r.ctSetAside),
    asOf: r.asOf,
  }))
}

/** P&L lines in the shown period that land in no group, so the totals would miss them. */
export async function getUngroupedPnlAccounts() {
  const res = await db.execute<{ account_name: string; total: string }>(sql`
    select l.account_name, sum(l.amount)::text as total
    from xero_pnl_line l
    left join account_group g on g.account_id = l.account_id
    where (g.account_id is null or g."group" = 'exclude')
      and l.period_start >= date_trunc('month', now() at time zone 'Europe/London') - interval '12 months'
    group by l.account_name
    having sum(l.amount) <> 0
    order by 1
  `)
  return res.rows
}
