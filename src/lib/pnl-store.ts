import "server-only"

import { asc, sql } from "drizzle-orm"

import { db } from "@/db"
import { vPnlMonthly } from "@/db/schema"
import { lastMonths, londonToday, withRolling3 } from "@/lib/pnl"

export type PnlMonth = {
  month: string
  sales: number
  peopleCosts: number
  otherCosts: number
  profit: number
  margin: number | null
  /** Rolling 3-month averages over complete months; null for the current month. */
  salesAvg3: number | null
  profitAvg3: number | null
  asOf: Date | null
}

// numeric arrives as a string; figures are 2dp GBP, safe as JS numbers for display and charting.
export async function getPnlMonthly(): Promise<PnlMonth[]> {
  const rows = await db
    .select()
    .from(vPnlMonthly)
    .orderBy(asc(vPnlMonthly.month))
  const [current] = lastMonths(londonToday(), 1)
  const months = rows.map((r) => ({
    month: r.month,
    sales: Number(r.sales),
    peopleCosts: Number(r.peopleCosts),
    otherCosts: Number(r.otherCosts),
    profit: Number(r.profit),
    margin: r.margin === null ? null : Number(r.margin),
    asOf: r.asOf,
  }))
  return withRolling3(months, current.start)
}

/**
 * Income and expense accounts with activity that land in
 * no column, so the totals would miss them.
 */
export async function getUngroupedPnlAccounts() {
  const res = await db.execute<{ account_name: string }>(sql`
    select a.name as account_name
    from v_ledger_line l
    join xero_account a on a.account_id = l.account_id
    left join account_group g on g.account_id = l.account_id
    where a.class in ('REVENUE', 'EXPENSE')
      and (g.account_id is null or g."group" = 'exclude')
    group by a.name
    having sum(l.credit) <> 0
    order by 1
  `)
  return res.rows
}

/** Costs by account between two dates (inclusive), for the cost-mix chart. */
export async function getCostsByAccount(from: string, to: string) {
  const res = await db.execute<{
    account_id: string
    name: string
    group: "people" | "other"
    amount: string
  }>(sql`
    select a.account_id, a.name, g."group", (-sum(l.credit))::text as amount
    from v_ledger_line l
    join account_group g on g.account_id = l.account_id and g."group" in ('people', 'other')
    join xero_account a on a.account_id = l.account_id
    where l.date between ${from} and ${to}
    group by 1, 2, 3
    having sum(l.credit) <> 0
  `)
  return res.rows.map((r) => ({
    key: r.account_id,
    label: r.name,
    group: r.group,
    total: Number(r.amount),
  }))
}
