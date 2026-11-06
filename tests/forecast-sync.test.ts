import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { db, pool } from "@/db"
import {
  contractorBill,
  contractorPaymentExclusion,
  payRate,
  person,
  settings,
  solidtimeMember,
  solidtimeTimeEntry,
  vForecastSalesInvoice,
  xeroAccount,
  xeroBankTransaction,
  xeroBankTransfer,
  xeroInvoice,
} from "@/db/schema"
import { londonDate } from "@/lib/forecast"
import { applyContractorMatching } from "@/lib/forecast-sync"
import { loadCashLines } from "@/lib/forecast-store"
import { resolveSettings } from "@/lib/settings"

vi.hoisted(() => {
  process.env.SOLIDTIME_API_URL = "https://solidtime.example.com"
  process.env.SOLIDTIME_API_TOKEN = "test-token"
  process.env.SOLIDTIME_ORGANIZATION_ID = "org-1"
})

const { syncSolidtime } = await import("@/lib/solidtime/sync")

const id = (n: number) =>
  `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`

const OPERATING = id(901)
const RESERVE = id(902)
const USER = id(801)

function timeEntry(n: number, start: Date) {
  return {
    id: id(n),
    start: start.toISOString().replace(/\.\d{3}Z$/, "Z"),
    end: new Date(start.getTime() + 3_600_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z"),
    duration: 3600,
    user_id: USER,
    project_id: null,
    billable: true,
    type: "work",
  }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

let served: ReturnType<typeof timeEntry>[] = []
let reportedTotal: number | null = null
let failAtOffset: number | null = null

function mockSolidtime() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(new Headers(init?.headers).get("User-Agent")).toBe(
        "fat-controller"
      )
      if (url.pathname.endsWith("/users/me/api-tokens"))
        return Response.json({
          data: [{ revoked: false, expires_at: "2027-08-28T14:29:21Z" }],
        })
      if (url.pathname.endsWith("/members"))
        return Response.json({
          data: [
            {
              id: id(701),
              user_id: USER,
              name: "Casey Contractor",
              role: "employee",
              is_placeholder: false,
            },
          ],
          meta: { last_page: 1 },
        })
      if (url.pathname.endsWith("/projects"))
        return Response.json({ data: [], meta: { last_page: 1 } })
      expect(url.pathname).toContain("/organizations/org-1/time-entries")
      expect(url.searchParams.get("type")).toBe("work")
      const offset = Number(url.searchParams.get("offset"))
      if (failAtOffset === offset) return new Response("nope", { status: 500 })
      const limit = Number(url.searchParams.get("limit"))
      const start = url.searchParams.get("start")!
      const end = url.searchParams.get("end")!
      expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
      const inWindow = served.filter((e) => e.start >= start && e.start < end)
      return Response.json({
        data: inWindow.slice(offset, offset + limit),
        meta: { total: reportedTotal ?? inWindow.length },
      })
    })
  )
}

beforeEach(async () => {
  await db.execute(
    sql`truncate solidtime_time_entry, solidtime_member, solidtime_project, person, project, contractor_bill, contractor_payment_exclusion, xero_bank_transaction, xero_bank_transfer, xero_payment, xero_account, account_group, xero_invoice, bank_balance, settings restart identity cascade`
  )
  served = []
  reportedTotal = null
  failAtOffset = null
  mockSolidtime()
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await pool.end()
})

const storedIds = async () =>
  (await db.select({ id: solidtimeTimeEntry.id }).from(solidtimeTimeEntry))
    .map((r) => r.id)
    .sort()

describe("syncSolidtime", () => {
  it("replaces the window: deleted entries go, new ones arrive, older ones stay", async () => {
    // Stored already: one to keep, one Solidtime has since deleted, one too old to touch.
    served = [timeEntry(1, daysAgo(5)), timeEntry(2, daysAgo(6))]
    await syncSolidtime()
    expect(await storedIds()).toEqual([id(1), id(2)])
    await db.insert(solidtimeTimeEntry).values({
      id: id(3),
      userId: USER,
      start: daysAgo(200),
      end: daysAgo(200),
      durationSeconds: 60,
      billable: true,
      raw: {},
    })

    // Entry 2 deleted; entry 4 moved into the window.
    served = [timeEntry(1, daysAgo(5)), timeEntry(4, daysAgo(3))]
    await syncSolidtime()
    expect(await storedIds()).toEqual([id(1), id(3), id(4)])
  })

  it("leaves stored entries untouched when a page fails", async () => {
    served = [timeEntry(1, daysAgo(5))]
    await syncSolidtime()
    served = Array.from({ length: 600 }, (_, i) =>
      timeEntry(i + 10, daysAgo(4))
    )
    failAtOffset = 500
    await expect(syncSolidtime()).rejects.toThrow(/failed: 500/)
    expect(await storedIds()).toEqual([id(1)])
  })

  it("leaves stored entries untouched when fewer come back than reported", async () => {
    served = [timeEntry(1, daysAgo(5))]
    await syncSolidtime()
    served = []
    reportedTotal = 2
    await expect(syncSolidtime()).rejects.toThrow(/nothing was changed/)
    expect(await storedIds()).toEqual([id(1)])
  })

  it("backfills on the first sync, then keeps to the rolling window", async () => {
    await db.insert(settings).values({
      key: "forecast_start_date",
      value: londonDate(daysAgo(150)),
    })
    served = [timeEntry(1, daysAgo(150))]
    await syncSolidtime()
    expect(await storedIds()).toEqual([id(1)])

    // Outside 90 days, so a later sync neither fetches nor removes it.
    served = []
    await syncSolidtime()
    expect(await storedIds()).toEqual([id(1)])
  })

  it("stores members and the token's expiry", async () => {
    await syncSolidtime()
    const [m] = await db.select().from(solidtimeMember)
    expect(m.userId).toBe(USER)
    const [s] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "solidtime_token_expires_at"))
    expect(s.value).toBe("2027-08-28T14:29:21Z")
  })

  it("reports an expired token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 }))
    )
    await expect(syncSolidtime()).rejects.toThrow("Solidtime token expired")
  })
})

describe("the view and bank lines", () => {
  const roles = {
    [OPERATING]: "operating",
    [RESERVE]: "tax_reserve",
  } as const

  it("gives each invoice its number, due date and tax, in GBP", async () => {
    await db.insert(xeroInvoice).values([
      {
        invoiceId: id(1),
        type: "ACCREC",
        invoiceNumber: "AAA-I1",
        date: "2026-05-01",
        dueDate: "2026-05-08",
        status: "AUTHORISED",
        subTotal: "100.00",
        totalTax: "20.00",
        total: "120.00",
        amountDue: "120.00",
        amountPaid: "0.00",
        raw: {},
      },
      {
        invoiceId: id(2),
        type: "ACCREC",
        date: "2026-05-01",
        status: "VOIDED",
        raw: {},
      },
      {
        invoiceId: id(3),
        type: "ACCPAY",
        date: "2026-05-01",
        status: "AUTHORISED",
        raw: {},
      },
    ])
    const rows = await db.select().from(vForecastSalesInvoice)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      invoiceNumber: "AAA-I1",
      dueDate: "2026-05-08",
      subTotal: "100.00",
      totalTax: "20.00",
      outstandingGbp: "120.00",
    })
  })

  it("finds a transfer's direction from BankTransfers, and skips deleted ones", async () => {
    await db.insert(xeroBankTransaction).values([
      {
        bankTransactionId: id(11),
        type: "SPEND-TRANSFER",
        bankAccountId: OPERATING,
        date: "2026-05-02",
        status: "AUTHORISED",
        total: "200.00",
        raw: {},
      },
      {
        bankTransactionId: id(12),
        type: "RECEIVE-TRANSFER",
        bankAccountId: OPERATING,
        date: "2026-05-03",
        status: "AUTHORISED",
        total: "50.00",
        raw: {},
      },
      {
        bankTransactionId: id(13),
        type: "SPEND-TRANSFER",
        bankAccountId: OPERATING,
        date: "2026-05-04",
        status: "AUTHORISED",
        total: "999.00",
        raw: {},
      },
    ])
    await db.insert(xeroBankTransfer).values([
      {
        bankTransferId: id(21),
        fromAccountId: OPERATING,
        toAccountId: RESERVE,
        fromBankTransactionId: id(11),
        raw: {},
      },
      {
        bankTransferId: id(22),
        fromAccountId: RESERVE,
        toAccountId: OPERATING,
        toBankTransactionId: id(12),
        raw: {},
      },
      {
        bankTransferId: id(23),
        fromAccountId: OPERATING,
        toAccountId: RESERVE,
        fromBankTransactionId: id(13),
        status: "DELETED",
        raw: {},
      },
    ])
    const s = resolveSettings([{ key: "bank_account_roles", value: roles }])
    const lines = await loadCashLines(s, "2026-01-01")
    expect(lines.map((l) => [l.sourceId, l.kind])).toEqual([
      [id(11), "set_aside"],
      [id(12), "backstop_in"],
    ])
  })
})

describe("contractor matching", () => {
  async function setUp() {
    const [p] = await db
      .insert(person)
      .values({
        name: "Casey Contractor",
        kind: "contractor",
        solidtimeUserId: USER,
        xeroContactId: id(601),
      })
      .returning()
    await db
      .insert(payRate)
      .values({ personId: p.id, projectId: null, dayRateGbp: "300.00" })
    await db.insert(settings).values([
      { key: "forecast_start_date", value: "2026-04-01" },
      { key: "bank_account_roles", value: { [OPERATING]: "operating" } },
    ])
    await db.insert(xeroAccount).values({
      accountId: id(501),
      name: "Subcontractors",
      type: "OVERHEADS",
      class: "EXPENSE",
      raw: {},
    })
    await db.execute(
      sql`insert into account_group (account_id, "group", source) values (${id(501)}, 'people', 'manual')`
    )
    await db.insert(xeroBankTransaction).values({
      bankTransactionId: id(31),
      type: "SPEND",
      contactId: id(601),
      bankAccountId: OPERATING,
      date: "2026-06-05",
      status: "AUTHORISED",
      total: "290.00",
      raw: {
        LineAmountTypes: "NoTax",
        LineItems: [{ AccountID: id(501), LineAmount: 290, TaxAmount: 0 }],
      },
    })
    return p
  }

  it("saves a forecast bill when a payment closes it, without an exact match", async () => {
    const p = await setUp()
    // One tracked day in May, so May's calculated bill is £300.
    await db.insert(solidtimeTimeEntry).values({
      id: id(41),
      userId: USER,
      start: new Date("2026-05-12T09:00:00Z"),
      end: new Date("2026-05-12T16:30:00Z"),
      durationSeconds: 27000,
      billable: true,
      raw: {},
    })
    expect(await applyContractorMatching()).toBe(1)
    const [bill] = await db.select().from(contractorBill)
    expect(bill).toMatchObject({
      personId: p.id,
      issuedOn: "2026-05-29",
      amountGbp: "300.00",
      paidOn: "2026-06-05",
      paidAmountGbp: "290.00",
      paidSource: "unmatched",
      paidByBankTransactionId: id(31),
    })
  })

  it("doesn't link a payment again once it's excluded", async () => {
    const p = await setUp()
    await db.insert(contractorBill).values({
      personId: p.id,
      issuedOn: "2026-05-29",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-29",
      amountGbp: "290.00",
      dueOn: "2026-06-28",
    })
    await db
      .insert(contractorPaymentExclusion)
      .values({ bankTransactionId: id(31), personId: p.id })
    expect(await applyContractorMatching()).toBe(0)
    const [bill] = await db.select().from(contractorBill)
    expect(bill.paidOn).toBeNull()
  })

  it("marks an exact match as automatic", async () => {
    const p = await setUp()
    await db.insert(contractorBill).values({
      personId: p.id,
      issuedOn: "2026-05-29",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-29",
      amountGbp: "290.00",
      dueOn: "2026-06-28",
    })
    await applyContractorMatching()
    const [bill] = await db.select().from(contractorBill)
    expect(bill.paidSource).toBe("auto")
  })
})
