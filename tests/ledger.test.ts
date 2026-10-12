import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db, pool } from "@/db"
import {
  accountGroup,
  settings,
  vPnlMonthly,
  xeroAccount,
  xeroBankTransaction,
  xeroCreditNote,
  xeroInvoice,
  xeroManualJournal,
} from "@/db/schema"

// All fixtures fall in the current London month so they appear in v_pnl_monthly.
const ym = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
}).format(new Date())
const day = (d: string) => `${ym}-${d}`

const acc = (n: number) => `cccccccc-0000-4000-8000-00000000000${n}`
const doc = (n: number) =>
  `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`
const SALES = acc(1)
const SALARIES = acc(2)
const SOFTWARE = acc(3)
const BANK = acc(4)

beforeAll(async () => {
  await db.execute(
    sql`truncate xero_account, account_group, xero_invoice, xero_credit_note, xero_bank_transaction, xero_manual_journal, settings restart identity cascade`
  )
  await db.insert(settings).values({ key: "ct_set_aside_rate", value: 0.2 })
  await db.insert(xeroAccount).values([
    {
      accountId: SALES,
      code: "200",
      name: "Sales",
      type: "REVENUE",
      class: "REVENUE",
      raw: {},
    },
    {
      accountId: SALARIES,
      code: "477",
      name: "Salaries",
      type: "OVERHEADS",
      class: "EXPENSE",
      raw: {},
    },
    {
      accountId: SOFTWARE,
      code: "463",
      name: "Software",
      type: "OVERHEADS",
      class: "EXPENSE",
      raw: {},
    },
    {
      accountId: BANK,
      code: "090",
      name: "Bank",
      type: "BANK",
      class: "ASSET",
      raw: {},
    },
  ])
  await db.insert(accountGroup).values([
    { accountId: SALES, group: "sales", source: "auto" },
    { accountId: SALARIES, group: "people", source: "auto" },
    { accountId: SOFTWARE, group: "other", source: "auto" },
    { accountId: BANK, group: "exclude", source: "auto" },
  ])

  const invoice = (
    n: number,
    type: string,
    status: string,
    lineAmountTypes: string,
    rate: string,
    lines: object[]
  ) => ({
    invoiceId: doc(n),
    type,
    status,
    date: day("10"),
    lineAmountTypes,
    currencyRate: rate,
    raw: { LineItems: lines },
  })
  await db.insert(xeroInvoice).values([
    // Exclusive: £1,000 net (code only, no AccountID) → sales +1000
    invoice(1, "ACCREC", "PAID", "Exclusive", "1", [
      { AccountCode: "200", LineAmount: 1000, TaxAmount: 200 },
    ]),
    // USD 300 at rate 2 → sales +150
    invoice(2, "ACCREC", "AUTHORISED", "NoTax", "2", [
      { AccountID: SALES, LineAmount: 300, TaxAmount: 0 },
    ]),
    // Bill: software +100
    invoice(3, "ACCPAY", "AUTHORISED", "Exclusive", "1", [
      { AccountCode: "463", LineAmount: 100, TaxAmount: 20 },
    ]),
    // Excluded: draft
    invoice(4, "ACCREC", "DRAFT", "Exclusive", "1", [
      { AccountCode: "200", LineAmount: 9999, TaxAmount: 0 },
    ]),
  ])
  // Customer credit note: sales −50
  await db.insert(xeroCreditNote).values({
    creditNoteId: doc(5),
    type: "ACCRECCREDIT",
    status: "AUTHORISED",
    date: day("12"),
    raw: {
      LineAmountTypes: "Exclusive",
      LineItems: [{ AccountCode: "200", LineAmount: 50, TaxAmount: 10 }],
    },
  })
  const bank = (
    n: number,
    type: string,
    status: string,
    lineAmountTypes: string,
    lines: object[]
  ) => ({
    bankTransactionId: doc(n),
    type,
    status,
    date: day("15"),
    raw: { LineAmountTypes: lineAmountTypes, LineItems: lines },
  })
  await db.insert(xeroBankTransaction).values([
    // Inclusive £120 with £20 VAT → software +100
    bank(6, "SPEND", "AUTHORISED", "Inclusive", [
      { AccountID: SOFTWARE, LineAmount: 120, TaxAmount: 20 },
    ]),
    // Excluded: transfer and deleted
    bank(7, "SPEND-TRANSFER", "AUTHORISED", "NoTax", [
      { AccountID: SOFTWARE, LineAmount: 5000 },
    ]),
    bank(8, "SPEND", "DELETED", "NoTax", [
      { AccountID: SOFTWARE, LineAmount: 777 },
    ]),
  ])
  // Manual journal: debit salaries 400, credit bank 400 → people +400
  await db.insert(xeroManualJournal).values({
    manualJournalId: doc(9),
    date: day("28"),
    status: "POSTED",
    raw: {
      JournalLines: [
        { AccountID: SALARIES, LineAmount: 400 },
        { AccountID: BANK, LineAmount: -400 },
      ],
    },
  })
})

afterAll(() => pool.end())

describe("v_pnl_monthly from transactions", () => {
  it("nets invoices, bills, credit notes, bank lines and journals into the month", async () => {
    const months = await db.select().from(vPnlMonthly)
    expect(months).toHaveLength(13)
    expect(months.at(-1)).toMatchObject({
      month: day("01"),
      sales: "1100.00", // 1000 + 150 − 50
      peopleCosts: "400.00",
      otherCosts: "200.00", // bill 100 + bank 100
      profit: "500.00",
      margin: "0.4545",
      ctSetAside: "220.00",
    })
    expect(months.slice(0, -1).every((m) => m.sales === "0.00")).toBe(true)
  })
})
