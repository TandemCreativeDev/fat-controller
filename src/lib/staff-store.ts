import "server-only"

import { gte } from "drizzle-orm"

import { db } from "@/db"
import { vStaffPayMonthly } from "@/db/schema"
import { lastMonths, londonToday } from "@/lib/pnl"
import { getPnlMonthly } from "@/lib/pnl-store"

export type StaffMember = {
  key: string
  name: string
  byMonth: Record<string, number>
  /** Last 12 full months (excludes the current month). */
  total12: number
  firstPaid: string | null
  lastPaid: string | null
}

export async function getStaffPay() {
  const months = lastMonths(londonToday(), 13).map((m) => m.start)
  const current = months[months.length - 1]
  const [rows, pnl] = await Promise.all([
    db
      .select()
      .from(vStaffPayMonthly)
      .where(gte(vStaffPayMonthly.month, months[0])),
    getPnlMonthly(),
  ])

  const people = new Map<string, StaffMember>()
  for (const r of rows) {
    const key = r.contactId ?? "unassigned"
    const p = people.get(key) ?? {
      key,
      name: r.name,
      byMonth: {},
      total12: 0,
      firstPaid: null,
      lastPaid: null,
    }
    const amount = Number(r.amount)
    p.byMonth[r.month] = (p.byMonth[r.month] ?? 0) + amount
    if (r.month !== current) p.total12 += amount
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
