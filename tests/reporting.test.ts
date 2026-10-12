import { asc, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db, pool } from "@/db"
import {
  settings,
  vAgedDebtors,
  vCurrentFy,
  vTakeHomeMonthly,
  vTakeHomeYtd,
  xeroAccount,
  xeroBankTransaction,
  xeroContact,
  xeroInvoice,
} from "@/db/schema"

// Dates relative to London "today" so buckets are deterministic.
const today = new Date(
  `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date())}T00:00:00Z`
)
const daysAgo = (n: number) =>
  new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10)

const id = (n: number) =>
  `eeeeeeee-0000-4000-8000-${String(n).padStart(12, "0")}`
const CLIENT = id(1)
const DIRECTOR = id(2)
const REMUNERATION = id(3)
const DIVIDENDS = id(4)

beforeAll(async () => {
  await db.execute(
    sql`truncate xero_contact, xero_invoice, xero_account, xero_bank_transaction, settings restart identity cascade`
  )
  // Financial year started 10 days ago.
  const start = new Date(today.getTime() - 10 * 86_400_000)
  await db.insert(settings).values({
    key: "financial_year_start",
    value: { month: start.getUTCMonth() + 1, day: start.getUTCDate() },
  })
  await db.insert(xeroContact).values([
    { contactId: CLIENT, name: "Client Co", raw: {} },
    { contactId: DIRECTOR, name: "Director One", raw: {} },
  ])
  const inv = (
    n: number,
    due: string,
    amountDue: string,
    status = "AUTHORISED"
  ) => ({
    invoiceId: id(100 + n),
    invoiceNumber: `INV-${n}`,
    type: "ACCREC",
    contactId: CLIENT,
    status,
    date: daysAgo(120),
    dueDate: due,
    amountDue,
    currencyRate: "1",
    raw: {},
  })
  await db.insert(xeroInvoice).values([
    inv(1, daysAgo(-5), "100"), // not yet due
    inv(2, daysAgo(10), "200"), // 1–30
    inv(3, daysAgo(45), "300"), // 31–60
    inv(4, daysAgo(95), "400"), // over 90
    inv(5, daysAgo(10), "0"), // paid off: excluded
    inv(6, daysAgo(10), "999", "DRAFT"), // draft: excluded
  ])
  await db.insert(xeroAccount).values([
    {
      accountId: REMUNERATION,
      name: "Directors' Remuneration",
      type: "OVERHEADS",
      class: "EXPENSE",
      raw: {},
    },
    {
      accountId: DIVIDENDS,
      name: "Dividends Paid",
      type: "EQUITY",
      class: "EQUITY",
      raw: {},
    },
  ])
  const spend = (
    n: number,
    date: string,
    accountId: string,
    amount: number
  ) => ({
    bankTransactionId: id(200 + n),
    type: "SPEND",
    status: "AUTHORISED",
    contactId: DIRECTOR,
    date,
    raw: {
      LineAmountTypes: "NoTax",
      LineItems: [{ AccountID: accountId, LineAmount: amount }],
    },
  })
  await db.insert(xeroBankTransaction).values([
    spend(1, daysAgo(5), REMUNERATION, 1000),
    spend(2, daysAgo(4), DIVIDENDS, 2500),
    spend(3, daysAgo(40), DIVIDENDS, 9999), // before this FY: excluded
  ])
})

afterAll(() => pool.end())

describe("reporting views", () => {
  it("v_current_fy starts on the configured day", async () => {
    const [fy] = await db.select().from(vCurrentFy)
    expect(fy.fyStart).toBe(daysAgo(10))
  })

  it("v_aged_debtors buckets open invoices by days overdue", async () => {
    const rows = await db
      .select()
      .from(vAgedDebtors)
      .orderBy(asc(vAgedDebtors.invoiceNumber))
    expect(
      rows.map((r) => [
        r.invoiceNumber,
        r.daysOverdue,
        r.bucket,
        r.outstandingGbp,
      ])
    ).toEqual([
      ["INV-1", 0, "Not yet due", "100.00"],
      ["INV-2", 10, "1–30 days overdue", "200.00"],
      ["INV-3", 45, "31–60 days overdue", "300.00"],
      ["INV-4", 95, "Over 90 days overdue", "400.00"],
    ])
  })

  it("v_take_home_ytd sums salary and dividends since the FY start", async () => {
    const rows = await db.select().from(vTakeHomeYtd)
    expect(rows).toEqual([
      {
        contactId: DIRECTOR,
        director: "Director One",
        fyStart: daysAgo(10),
        salaryGbp: "1000.00",
        dividendsGbp: "2500.00",
        totalGbp: "3500.00",
      },
    ])
  })

  it("v_take_home_monthly keeps every month, including before this FY", async () => {
    const rows = await db.select().from(vTakeHomeMonthly)
    const total = (k: "salaryGbp" | "dividendsGbp") =>
      rows.reduce((t, r) => t + Number(r[k]), 0)
    expect(total("salaryGbp")).toBe(1000)
    expect(total("dividendsGbp")).toBe(12499)
    const early = rows.find((r) => r.month === `${daysAgo(40).slice(0, 7)}-01`)
    expect(Number(early?.dividendsGbp)).toBeGreaterThanOrEqual(9999)
    expect(rows.every((r) => r.director === "Director One")).toBe(true)
  })
})
