import "server-only"

import { asc, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  vAgedDebtors,
  vCurrentFy,
  vTakeHomeYtd,
  xeroOrganisation,
} from "@/db/schema"
import type { AnalysisPackInput } from "@/lib/analysis-pack"
import { lastMonths, londonToday } from "@/lib/pnl"
import { getClientSummary } from "@/lib/clients-store"
import { getPnlMonthly } from "@/lib/pnl-store"

const GROUP_LABEL = { people: "People costs", other: "Other costs" } as const

/** Everything the pack needs, read from the same views as the dashboard. */
export async function getAnalysisPackInput(
  includeLines: boolean
): Promise<AnalysisPackInput> {
  const months = lastMonths(londonToday(), 13)
  const from = months[0].start
  const to = months[months.length - 1].end

  const [org] = await db
    .select({ name: xeroOrganisation.name })
    .from(xeroOrganisation)
    .limit(1)
  const [fy] = await db.select().from(vCurrentFy)
  const pnl = await getPnlMonthly()
  const clientsFy = (await getClientSummary()).filter(
    (c) => c.invoicesFy > 0 || c.invoicedFy !== 0
  )

  const groups = await db.execute<{ group: string; name: string }>(sql`
    select distinct g."group", a.name
    from v_ledger_line l
    join account_group g on g.account_id = l.account_id
    join xero_account a on a.account_id = l.account_id
    where g."group" in ('sales', 'people', 'other')
      and l.date between ${from} and ${to}
    order by 2
  `)
  const names = (g: string) =>
    groups.rows.filter((r) => r.group === g).map((r) => r.name)

  const clientMonths = await db.execute<{
    month: string
    client: string
    invoiced: string
    received: string
  }>(sql`
    select r.month::text, coalesce(c.name, 'Unknown contact') as client,
      r.invoiced_gbp::text as invoiced, r.paid_gbp::text as received
    from v_revenue_by_client_month r
    left join xero_contact c on c.contact_id = r.contact_id
    where r.month between ${from} and ${to}
      and (r.invoiced_gbp <> 0 or r.paid_gbp <> 0)
    order by r.month, client
  `)

  const costs = await db.execute<{
    month: string
    account: string
    group: "people" | "other"
    amount: string
  }>(sql`
    select date_trunc('month', l.date)::date::text as month, a.name as account,
      g."group", (-sum(l.credit))::text as amount
    from v_ledger_line l
    join account_group g on g.account_id = l.account_id and g."group" in ('people', 'other')
    join xero_account a on a.account_id = l.account_id
    where l.date between ${from} and ${to}
    group by 1, 2, 3
    having sum(l.credit) <> 0
    order by 1, 2
  `)

  const aged = await db
    .select()
    .from(vAgedDebtors)
    .orderBy(asc(vAgedDebtors.client), asc(vAgedDebtors.dueDate))
  const takeHome = await db
    .select()
    .from(vTakeHomeYtd)
    .orderBy(asc(vTakeHomeYtd.director))

  const lines = includeLines
    ? (
        await db.execute<{
          date: string
          type: string
          number: string | null
          contact: string | null
          account: string
          description: string | null
          net: string
        }>(sql`
          select l.date::text, case i.type when 'ACCREC' then 'Sales invoice' else 'Bill' end as type,
            i.invoice_number as number, c.name as contact, a.name as account,
            l.description, l.credit::text as net
          from v_ledger_line l
          join xero_invoice i on i.invoice_id = l.document_id
          join xero_account a on a.account_id = l.account_id
          left join xero_contact c on c.contact_id = l.contact_id
          where l.source = 'invoice' and l.date between ${from} and ${to}
          order by l.date, i.invoice_number
        `)
      ).rows.map((r) => ({ ...r, net: Number(r.net) }))
    : undefined

  return {
    company: org?.name ?? "Company",
    generatedAt: new Date(),
    asOf: pnl[0]?.asOf ?? null,
    period: { from, to },
    fyStart: fy?.fyStart ?? from,
    groups: {
      sales: names("sales"),
      people: names("people"),
      other: names("other"),
    },
    pnl,
    clientMonths: clientMonths.rows.map((r) => ({
      ...r,
      invoiced: Number(r.invoiced),
      received: Number(r.received),
    })),
    clientsFy: clientsFy.map((c) => ({
      client: c.name,
      invoiced: c.invoicedFy,
      invoices: c.invoicesFy,
      avgInvoice: c.avgInvoiceFy,
    })),
    aged: aged.map((a) => ({
      client: a.client,
      invoiceNumber: a.invoiceNumber,
      date: a.date,
      dueDate: a.dueDate,
      daysOverdue: a.daysOverdue,
      bucket: a.bucket,
      outstanding: Number(a.outstandingGbp),
    })),
    costs: costs.rows.map((c) => ({
      month: c.month,
      account: c.account,
      group: GROUP_LABEL[c.group],
      amount: Number(c.amount),
    })),
    takeHome: takeHome.map((t) => ({
      director: t.director,
      salary: Number(t.salaryGbp),
      dividends: Number(t.dividendsGbp),
      total: Number(t.totalGbp),
    })),
    lines,
  }
}
