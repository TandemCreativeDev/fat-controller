import "server-only"

import { desc, eq, gte } from "drizzle-orm"

import { db } from "@/db"
import {
  syncCursor,
  vClientSummary,
  vRevenueByClientMonth,
  xeroContact,
} from "@/db/schema"
import { getLifetimeMonths } from "@/lib/pnl-store"

const n = (v: string | null) => (v === null ? null : Number(v))

export async function getClientSummary() {
  const rows = await db
    .select()
    .from(vClientSummary)
    .orderBy(
      desc(vClientSummary.invoicedFy),
      desc(vClientSummary.invoicedPrevFy)
    )
  return rows.map((r) => ({
    contactId: r.contactId,
    name: r.name,
    fyStart: r.fyStart,
    invoicedFy: Number(r.invoicedFy),
    invoicedPrevFy: Number(r.invoicedPrevFy),
    shareFy: n(r.shareFy),
    sharePrevFy: n(r.sharePrevFy),
    paidFy: Number(r.paidFy),
    outstanding: Number(r.outstanding),
    avgDaysToPay: n(r.avgDaysToPay),
    lastInvoiceDate: r.lastInvoiceDate,
    invoicesFy: r.invoicesFy,
    avgInvoiceFy: n(r.avgInvoiceFy),
  }))
}

/** Invoiced per client for every month since records began, as a client → month → amount grid. */
export async function getClientMonthGrid() {
  const months = (await getLifetimeMonths()).map((m) => m.start)
  const rows = await db
    .select({
      contactId: vRevenueByClientMonth.contactId,
      name: xeroContact.name,
      month: vRevenueByClientMonth.month,
      invoiced: vRevenueByClientMonth.invoicedGbp,
    })
    .from(vRevenueByClientMonth)
    .leftJoin(
      xeroContact,
      eq(xeroContact.contactId, vRevenueByClientMonth.contactId)
    )
    .where(gte(vRevenueByClientMonth.month, months[0]))

  const clients = new Map<
    string,
    { name: string; byMonth: Record<string, number>; total: number }
  >()
  for (const r of rows) {
    const key = r.contactId ?? "none"
    const c = clients.get(key) ?? {
      name: r.name ?? "Unknown contact",
      byMonth: {},
      total: 0,
    }
    const amount = Number(r.invoiced)
    c.byMonth[r.month] = (c.byMonth[r.month] ?? 0) + amount
    c.total += amount
    clients.set(key, c)
  }
  return {
    months,
    clients: [...clients.entries()]
      .map(([contactId, c]) => ({ contactId, ...c }))
      .filter((c) => c.total !== 0)
      .sort((a, b) => b.total - a.total),
  }
}

/** When invoices were last brought fully up to date. */
export async function getInvoicesAsOf(): Promise<Date | null> {
  const [c] = await db
    .select({ at: syncCursor.lastCompletedAt })
    .from(syncCursor)
    .where(eq(syncCursor.resource, "invoices"))
  return c?.at ?? null
}
