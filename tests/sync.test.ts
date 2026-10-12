import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { db, pool } from "@/db"
import {
  accountGroup,
  settings,
  syncCursor,
  syncRun,
  xeroConnection,
  xeroInvoice,
  xeroInvoiceLine,
} from "@/db/schema"
import { env } from "@/env"
import { encrypt, parseKey } from "@/lib/crypto"
import { resetThrottle } from "@/lib/xero/client"
import { runSync } from "@/lib/xero/sync"

const TENANT = "a3b2c1d0-0000-4000-8000-000000000001"
const ms = (iso: string) => `/Date(${Date.parse(iso)}+0000)/`

function invoice(n: number, updated: string) {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  return {
    InvoiceID: id,
    Type: "ACCREC",
    InvoiceNumber: `INV-${n}`,
    Contact: { ContactID: "11111111-1111-4111-8111-111111111111" },
    DateString: "2026-01-15T00:00:00",
    Status: "AUTHORISED",
    SubTotal: 100,
    TotalTax: 20,
    Total: 120,
    UpdatedDateUTC: ms(updated),
    LineItems: [
      {
        LineItemID: randomUUID(),
        AccountCode: "200",
        LineAmount: 100,
        TaxAmount: 20,
      },
    ],
  }
}

const ACCOUNTS = [
  {
    AccountID: "aaaaaaaa-0000-4000-8000-000000000001",
    Name: "Sales",
    Type: "REVENUE",
    Class: "REVENUE",
  },
  {
    AccountID: "aaaaaaaa-0000-4000-8000-000000000002",
    Name: "Salaries",
    Type: "OVERHEADS",
    Class: "EXPENSE",
  },
  {
    AccountID: "aaaaaaaa-0000-4000-8000-000000000003",
    Name: "Software",
    Type: "OVERHEADS",
    Class: "EXPENSE",
  },
]

type Call = {
  path: string
  page: string | null
  ifModifiedSince: string | null
}
let calls: Call[] = []
let invoicePages: Record<number, unknown[]> = {}

function mockXero() {
  calls = []
  resetThrottle()
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const headers = new Headers(init?.headers)
      const path = url.pathname.replace("/api.xro/2.0/", "")
      calls.push({
        path,
        page: url.searchParams.get("page"),
        ifModifiedSince: headers.get("If-Modified-Since"),
      })
      expect(headers.get("xero-tenant-id")).toBe(TENANT)
      const body: Record<string, unknown> = {
        Organisation: {
          Organisations: [
            {
              OrganisationID: randomUUID(),
              Name: "Demo Co",
              BaseCurrency: "GBP",
            },
          ],
        },
        Invoices: {
          Invoices:
            invoicePages[Number(url.searchParams.get("page") ?? 1)] ?? [],
        },
        Accounts: { Accounts: ACCOUNTS },
      }
      const key = path === "Organisation" ? "Organisation" : path
      return Response.json(body[key] ?? { [path]: [] })
    })
  )
}

beforeEach(async () => {
  await db.execute(
    sql`truncate xero_connection, sync_cursor, sync_run, xero_invoice, xero_invoice_line, xero_organisation, xero_account, account_group, xero_pnl_line, xero_report_snapshot, settings restart identity cascade`
  )
  const key = parseKey(env.TOKEN_ENCRYPTION_KEY!)
  await db.insert(xeroConnection).values({
    tenantId: TENANT,
    tenantName: "Demo Co",
    refreshTokenEnc: encrypt("refresh", key),
    accessTokenEnc: encrypt("access", key),
    accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
    scopes: "",
  })
  invoicePages = {}
  mockXero()
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await pool.end()
})

describe("runSync", () => {
  it("backfills every page, stores lines, and advances the cursor", async () => {
    invoicePages = {
      1: Array.from({ length: 100 }, (_, i) =>
        invoice(i + 1, "2026-02-01T10:00:00Z")
      ),
      2: Array.from({ length: 50 }, (_, i) =>
        invoice(
          i + 101,
          i === 49 ? "2026-03-05T08:30:00Z" : "2026-02-01T10:00:00Z"
        )
      ),
    }

    const result = await runSync("manual", 60_000)

    expect(result.status).toBe("done")
    const invoiceCalls = calls.filter((c) => c.path === "Invoices")
    expect(invoiceCalls.map((c) => c.page)).toEqual(["1", "2"])
    expect(invoiceCalls.every((c) => c.ifModifiedSince === null)).toBe(true)

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(xeroInvoice)
    const [{ l }] = await db
      .select({ l: sql<number>`count(*)::int` })
      .from(xeroInvoiceLine)
    expect(n).toBe(150)
    expect(l).toBe(150)

    const [cursor] = await db
      .select()
      .from(syncCursor)
      .where(eq(syncCursor.resource, "invoices"))
    expect(cursor.nextPage).toBeNull()
    expect(cursor.modifiedSince?.toISOString()).toBe("2026-03-05T08:30:00.000Z")

    const runs = await db.select().from(syncRun)
    expect(runs.find((r) => r.resource === "invoices")).toMatchObject({
      rowsChanged: 150,
      apiCalls: 2,
      error: null,
    })
  })

  it("sends If-Modified-Since on the next pass and replaces changed lines", async () => {
    invoicePages = { 1: [invoice(1, "2026-02-01T10:00:00Z")] }
    await runSync("manual", 60_000)

    const changed = invoice(1, "2026-04-01T09:00:00Z")
    changed.LineItems.push({
      LineItemID: randomUUID(),
      AccountCode: "201",
      LineAmount: 5,
      TaxAmount: 1,
    })
    invoicePages = { 1: [changed] }
    mockXero()
    await runSync("manual", 60_000)

    const call = calls.find((c) => c.path === "Invoices")
    expect(call?.ifModifiedSince).toBe("2026-02-01T10:00:00")
    const lines = await db.select().from(xeroInvoiceLine)
    expect(lines.map((x) => x.accountCode).sort()).toEqual(["200", "201"])
  })

  it("resumes a part-way pass from the saved page", async () => {
    await db.insert(syncCursor).values({ resource: "invoices", nextPage: 3 })
    invoicePages = { 3: [invoice(301, "2026-02-01T10:00:00Z")] }

    await runSync("manual", 60_000)

    expect(
      calls.filter((c) => c.path === "Invoices").map((c) => c.page)
    ).toEqual(["3"])
  })

  it("refuses to run twice at once", async () => {
    const [a, b] = await Promise.all([
      runSync("manual", 60_000),
      runSync("manual", 60_000),
    ])
    expect([a.status, b.status].sort()).toEqual(["busy", "done"])
  })

  it("auto-groups synced accounts and never calls Xero's P&L report", async () => {
    await runSync("manual", 60_000)
    const groups = await db.select().from(accountGroup)
    expect(
      Object.fromEntries(groups.map((g) => [g.accountId, g.group]))
    ).toEqual({
      [ACCOUNTS[0].AccountID]: "sales",
      [ACCOUNTS[1].AccountID]: "people",
      [ACCOUNTS[2].AccountID]: "other",
    })
    expect(calls.some((c) => c.path.startsWith("Reports"))).toBe(false)
  })

  it("keeps a director's manual account group through re-syncs", async () => {
    await runSync("manual", 60_000)
    await db
      .update(accountGroup)
      .set({ group: "other", source: "manual" })
      .where(eq(accountGroup.accountId, ACCOUNTS[1].AccountID))
    await db
      .update(syncCursor)
      .set({ modifiedSince: null })
      .where(eq(syncCursor.resource, "accounts"))
    mockXero()
    await runSync("cron", 60_000)
    const [g] = await db
      .select()
      .from(accountGroup)
      .where(eq(accountGroup.accountId, ACCOUNTS[1].AccountID))
    expect(g).toMatchObject({ group: "other", source: "manual" })
  })
})
