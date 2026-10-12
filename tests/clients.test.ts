import { asc, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db, pool } from "@/db"
import {
  settings,
  vClientSummary,
  vRevenueByClientMonth,
  xeroContact,
  xeroCreditNote,
  xeroInvoice,
  xeroPayment,
} from "@/db/schema"

// Financial year = calendar year, so "this FY" is this calendar year (London).
const Y = Number(
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
  }).format(new Date())
)
const d = (y: number, md: string) => `${y}-${md}`

const A = "aaaaaaaa-1111-4111-8111-000000000001"
const B = "bbbbbbbb-1111-4111-8111-000000000002"
const id = (n: number) =>
  `00000000-2222-4222-8222-${String(n).padStart(12, "0")}`

const inv = (
  n: number,
  contactId: string,
  over: Partial<typeof xeroInvoice.$inferInsert>
) => ({
  invoiceId: id(n),
  type: "ACCREC",
  contactId,
  status: "AUTHORISED",
  currencyCode: "GBP",
  currencyRate: "1",
  amountDue: "0",
  raw: {},
  ...over,
})

beforeAll(async () => {
  await db.execute(
    sql`truncate xero_contact, xero_invoice, xero_credit_note, xero_payment, settings restart identity cascade`
  )
  await db
    .insert(settings)
    .values({ key: "financial_year_start", value: { month: 1, day: 1 } })
  await db.insert(xeroContact).values([
    { contactId: A, name: "Alpha Ltd", isCustomer: true, raw: {} },
    { contactId: B, name: "Beta Inc", isCustomer: true, raw: {} },
  ])
  await db.insert(xeroInvoice).values([
    // A: paid this FY in 20 days; one open invoice from last FY.
    inv(1, A, {
      date: d(Y, "01-10"),
      subTotal: "1000",
      total: "1200",
      status: "PAID",
      fullyPaidOnDate: d(Y, "01-30"),
    }),
    inv(2, A, {
      date: d(Y - 1, "06-01"),
      subTotal: "500",
      total: "600",
      amountDue: "600",
    }),
    // Excluded: draft and voided.
    inv(3, A, {
      date: d(Y, "01-15"),
      subTotal: "999",
      total: "999",
      status: "DRAFT",
    }),
    inv(4, A, {
      date: d(Y, "01-16"),
      subTotal: "999",
      total: "999",
      status: "VOIDED",
    }),
    // B: USD invoice at 1.25 → £2,400 net, £2,880 outstanding.
    inv(5, B, {
      date: d(Y, "01-05"),
      subTotal: "3000",
      total: "3600",
      amountDue: "3600",
      currencyCode: "USD",
      currencyRate: "1.25",
    }),
  ])
  await db.insert(xeroCreditNote).values({
    creditNoteId: id(6),
    type: "ACCRECCREDIT",
    contactId: B,
    date: d(Y, "01-20"),
    status: "AUTHORISED",
    subTotal: "400",
    total: "480",
    currencyRate: "1",
    raw: {},
  })
  await db.insert(xeroPayment).values([
    {
      paymentId: id(7),
      invoiceId: id(1),
      date: d(Y, "01-30"),
      amount: "1200",
      currencyRate: "1",
      status: "AUTHORISED",
      raw: {},
    },
    {
      paymentId: id(8),
      invoiceId: id(1),
      date: d(Y, "01-31"),
      amount: "50",
      currencyRate: "1",
      status: "DELETED",
      raw: {},
    },
  ])
})

afterAll(() => pool.end())

describe("v_client_summary", () => {
  it("computes per-client FY totals, shares, outstanding, days to pay and average invoice", async () => {
    const rows = await db
      .select()
      .from(vClientSummary)
      .orderBy(asc(vClientSummary.name))
    expect(rows).toEqual([
      {
        contactId: A,
        name: "Alpha Ltd",
        fyStart: d(Y, "01-01"),
        invoicedFy: "1000.00",
        invoicedPrevFy: "500.00",
        shareFy: "0.3333",
        sharePrevFy: "1.0000",
        paidFy: "1200.00",
        outstanding: "600.00",
        avgDaysToPay: "20.0",
        lastInvoiceDate: d(Y, "01-10"),
        invoicesFy: 1,
        avgInvoiceFy: "1000.00",
      },
      {
        contactId: B,
        name: "Beta Inc",
        fyStart: d(Y, "01-01"),
        invoicedFy: "2000.00",
        invoicedPrevFy: "0.00",
        shareFy: "0.6667",
        sharePrevFy: "0.0000",
        paidFy: "0.00",
        outstanding: "2880.00",
        avgDaysToPay: null,
        lastInvoiceDate: d(Y, "01-05"),
        // The credit note lowers the total, not the invoice count.
        invoicesFy: 1,
        avgInvoiceFy: "2000.00",
      },
    ])
  })
})

describe("v_revenue_by_client_month", () => {
  it("nets credit notes into the month and counts only live payments", async () => {
    const rows = await db
      .select()
      .from(vRevenueByClientMonth)
      .orderBy(
        asc(vRevenueByClientMonth.contactId),
        asc(vRevenueByClientMonth.month)
      )
    expect(rows).toEqual([
      {
        contactId: A,
        month: d(Y - 1, "06-01"),
        invoicedGbp: "500.00",
        paidGbp: "0.00",
      },
      {
        contactId: A,
        month: d(Y, "01-01"),
        invoicedGbp: "1000.00",
        paidGbp: "1200.00",
      },
      {
        contactId: B,
        month: d(Y, "01-01"),
        invoicedGbp: "2000.00",
        paidGbp: "0.00",
      },
    ])
  })
})
