import "server-only"

import { and, gte, lte } from "drizzle-orm"

import { db } from "@/db"
import { vStaffPayMonthly } from "@/db/schema"
import { lastMonths, londonToday } from "@/lib/pnl"
import type { Period } from "@/lib/period"
import { getPnlMonthly } from "@/lib/pnl-store"

export type StaffMember = {
  key: string
  name: string
  byMonth: Record<string, number>
  /** Over the period, including this month to date. */
  total: number
  firstPaid: string | null
  lastPaid: string | null
}

export async function getStaffPay(period: Period) {
  const months = period.months
  const [{ start: current }] = lastMonths(londonToday(), 1)
  const [rows, pnl] = await Promise.all([
    db
      .select()
      .from(vStaffPayMonthly)
      .where(
        and(
          gte(vStaffPayMonthly.month, months[0]),
          lte(vStaffPayMonthly.month, months[months.length - 1])
        )
      ),
    getPnlMonthly(),
  ])

  const people = new Map<string, StaffMember>()
  for (const r of rows) {
    const key = r.contactId ?? "unassigned"
    const p = people.get(key) ?? {
      key,
      name: r.name,
      byMonth: {},
      total: 0,
      firstPaid: null,
      lastPaid: null,
    }
    const amount = Number(r.amount)
    p.byMonth[r.month] = (p.byMonth[r.month] ?? 0) + amount
    p.total += amount
    if (amount !== 0) {
      if (!p.firstPaid || r.month < p.firstPaid) p.firstPaid = r.month
      if (!p.lastPaid || r.month > p.lastPaid) p.lastPaid = r.month
    }
    people.set(key, p)
  }

  // Stable order by name so each person keeps their colour everywhere.
  const staff = [...people.values()]
    .filter((p) => Object.values(p.byMonth).some((v) => v !== 0))
    .sort((a, b) => a.name.localeCompare(b.name))

  const monthTotal = (m: string) =>
    staff.reduce((t, p) => t + (p.byMonth[m] ?? 0), 0)
  const salesByMonth = new Map(pnl.map((p) => [p.month, p.sales]))

  return {
    months,
    current,
    staff,
    monthly: months.map((m) => ({
      month: m,
      total: monthTotal(m),
      sales: salesByMonth.get(m) ?? 0,
      headcount: staff.filter((p) => (p.byMonth[m] ?? 0) > 0).length,
    })),
  }
}
