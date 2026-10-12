import "server-only"

import { and, eq, gte, lte, sql } from "drizzle-orm"

import { db } from "@/db"
import { syncCursor, vRevenueByClientMonth, xeroContact } from "@/db/schema"
import type { Period } from "@/lib/period"

const n = (v: string | null) => (v === null ? null : Number(v))

/**
 * One row per client for a period, by invoice date and ex VAT: invoiced (net of
 * credit notes), invoice count and average invoice, the same span a year
 * earlier, and cash received in the period. Outstanding, days to pay and last
 * invoice are as of today.
 */
export async function getClientTable(period: Period) {
  const prevFrom = period.previous?.from ?? null
  const prevTo = period.previous?.to ?? null
  const res = await db.execute<{
    contact_id: string | null
    name: string
    invoiced: string
    invoices: number
    avg_invoice: string | null
    invoiced_prev: string
    received: string
    outstanding: string
    avg_days_to_pay: string | null
    last_invoice_date: string | null
  }>(sql`
    with per as (
      select
        contact_id,
        coalesce(sum(net_gbp) filter (where date between ${period.from}::date and ${period.to}::date), 0) as invoiced,
        count(*) filter (where kind = 'invoice' and date between ${period.from}::date and ${period.to}::date)::int as invoices,
        coalesce(sum(net_gbp) filter (where date between ${prevFrom}::date and ${prevTo}::date), 0) as invoiced_prev,
        coalesce(sum(outstanding_gbp), 0) as outstanding,
        round(avg(days_to_pay), 1) as avg_days_to_pay,
        max(date) filter (where kind = 'invoice') as last_invoice_date
      from v_sales_document
      group by contact_id
    ),
    received as (
      select contact_id, sum(paid_gbp) as amount
      from v_revenue_by_client_month
      where month between date_trunc('month', ${period.from}::date) and ${period.to}::date
      group by contact_id
    )
    select
      p.contact_id,
      coalesce(c.name, 'Unknown contact') as name,
      p.invoiced::numeric(14, 2)::text as invoiced,
      p.invoices,
      round(p.invoiced / nullif(p.invoices, 0), 2)::numeric(14, 2)::text as avg_invoice,
      p.invoiced_prev::numeric(14, 2)::text as invoiced_prev,
      coalesce(r.amount, 0)::numeric(14, 2)::text as received,
      p.outstanding::numeric(14, 2)::text as outstanding,
      p.avg_days_to_pay::text as avg_days_to_pay,
      p.last_invoice_date::text as last_invoice_date
    from per p
    left join xero_contact c on c.contact_id = p.contact_id
    left join received r on r.contact_id is not distinct from p.contact_id
    where p.invoiced <> 0 or p.invoiced_prev <> 0 or p.outstanding <> 0
      or coalesce(r.amount, 0) <> 0
    order by p.invoiced desc, p.invoiced_prev desc, name
  `)
  const rows = res.rows.map((r) => ({
    contactId: r.contact_id,
    name: r.name,
    invoiced: Number(r.invoiced),
    invoices: r.invoices,
    avgInvoice: n(r.avg_invoice),
    invoicedPrev: Number(r.invoiced_prev),
    received: Number(r.received),
    outstanding: Number(r.outstanding),
    avgDaysToPay: n(r.avg_days_to_pay),
    lastInvoiceDate: r.last_invoice_date,
  }))
  const total = rows.reduce((t, r) => t + r.invoiced, 0)
  const totalPrev = rows.reduce((t, r) => t + r.invoicedPrev, 0)
  return rows.map((r) => ({
    ...r,
    share: total ? r.invoiced / total : null,
    sharePrev: totalPrev ? r.invoicedPrev / totalPrev : null,
  }))
}

/** Invoiced per client for each month of a period, as a client → month → amount grid. */
export async function getClientMonthGrid(period: Period) {
  const months = period.months
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
    .where(
      and(
        gte(vRevenueByClientMonth.month, months[0]),
        lte(vRevenueByClientMonth.month, months[months.length - 1])
      )
    )

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
