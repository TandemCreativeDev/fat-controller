import "server-only"

import {
  desc,
  eq,
  getColumns,
  inArray,
  sql,
  type InferInsertModel,
  type SQL,
} from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import type { z } from "zod"

import { db, pool } from "@/db"
import {
  accountGroup,
  settings,
  syncCursor,
  syncRun,
  xeroAccount,
  xeroBankTransaction,
  xeroContact,
  xeroCreditNote,
  xeroInvoice,
  xeroInvoiceLine,
  xeroManualJournal,
  xeroOrganisation,
  xeroPayment,
} from "@/db/schema"
import { defaultGroup, fyStartFromYearEnd } from "@/lib/pnl"
import { xeroGet, XeroApiError } from "./client"
import * as rec from "./records"
import { ensureAccountGroups } from "./account-groups"
import { XeroAuthError } from "./tokens"

const PAGE_SIZE = 100
const SYNC_LOCK_ID = 7_314_001

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

type Resource<S extends z.ZodType> = {
  name: string
  path: string
  /** Key of the array in Xero's response body. */
  key: string
  paged: boolean
  incremental: boolean
  params?: Record<string, string | number | boolean>
  schema: S
  save: (tx: Tx, records: z.infer<S>[]) => Promise<void>
}

const resource = <S extends z.ZodType>(r: Resource<S>) => r

/** Upsert rows, overwriting every non-key column from the incoming row. */
async function upsert<T extends PgTable>(
  tx: Tx,
  table: T,
  target: PgColumn,
  rows: InferInsertModel<T>[]
) {
  if (rows.length === 0) return
  const set: Record<string, SQL> = {}
  for (const [prop, col] of Object.entries(
    getColumns(table) as Record<string, PgColumn>
  )) {
    if (col.name !== target.name) set[prop] = sql.raw(`excluded."${col.name}"`)
  }
  // Generic over tables, so drizzle can't check the shapes here; callers pass typed rows.
  await tx
    .insert(table)
    .values(rows as never)
    .onConflictDoUpdate({ target, set: set as never })
}

/** Sync order matters only for readability of the log; there are no FKs between raw tables. */
export const RESOURCES = [
  resource({
    name: "organisation",
    path: "Organisation",
    key: "Organisations",
    paged: false,
    incremental: false,
    schema: rec.organisationSchema,
    save: async (tx, rs) => {
      const orgs = rs.map(rec.mapOrganisation)
      await upsert(tx, xeroOrganisation, xeroOrganisation.organisationId, orgs)
      // Take the financial year from Xero unless a director has set it by hand.
      const org = orgs[0]
      if (org?.financialYearEndDay && org.financialYearEndMonth) {
        const value = fyStartFromYearEnd(
          org.financialYearEndDay,
          org.financialYearEndMonth
        )
        await tx
          .insert(settings)
          .values({ key: "financial_year_start", value })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value },
            setWhere: sql`${settings.updatedBy} is null`,
          })
      }
    },
  }),
  resource({
    name: "accounts",
    path: "Accounts",
    key: "Accounts",
    paged: false,
    incremental: true,
    schema: rec.accountSchema,
    save: async (tx, rs) => {
      const accounts = rs.map(rec.mapAccount)
      await upsert(tx, xeroAccount, xeroAccount.accountId, accounts)
      if (accounts.length === 0) return
      // Auto-group new accounts; re-group renamed ones unless a director chose the group.
      await tx
        .insert(accountGroup)
        .values(
          accounts.map((a) => ({
            accountId: a.accountId,
            group: defaultGroup({ class: a.class ?? null, name: a.name }),
            source: "auto" as const,
          }))
        )
        .onConflictDoUpdate({
          target: accountGroup.accountId,
          set: { group: sql.raw(`excluded."group"`) },
          setWhere: sql`${accountGroup.source} = 'auto'`,
        })
    },
  }),
  resource({
    name: "contacts",
    path: "Contacts",
    key: "Contacts",
    paged: true,
    incremental: true,
    params: { includeArchived: true },
    schema: rec.contactSchema,
    save: (tx, rs) =>
      upsert(tx, xeroContact, xeroContact.contactId, rs.map(rec.mapContact)),
  }),
  resource({
    name: "invoices",
    path: "Invoices",
    key: "Invoices",
    paged: true,
    incremental: true,
    schema: rec.invoiceSchema,
    save: async (tx, rs) => {
      const mapped = rs.map(rec.mapInvoice)
      await upsert(
        tx,
        xeroInvoice,
        xeroInvoice.invoiceId,
        mapped.map((m) => m.invoice)
      )
      const ids = mapped.map((m) => m.invoice.invoiceId)
      if (ids.length)
        await tx
          .delete(xeroInvoiceLine)
          .where(inArray(xeroInvoiceLine.invoiceId, ids))
      const lines = mapped.flatMap((m) => m.lines)
      if (lines.length) await tx.insert(xeroInvoiceLine).values(lines)
    },
  }),
  resource({
    name: "credit_notes",
    path: "CreditNotes",
    key: "CreditNotes",
    paged: true,
    incremental: true,
    schema: rec.creditNoteSchema,
    save: (tx, rs) =>
      upsert(
        tx,
        xeroCreditNote,
        xeroCreditNote.creditNoteId,
        rs.map(rec.mapCreditNote)
      ),
  }),
  resource({
    name: "payments",
    path: "Payments",
    key: "Payments",
    paged: true,
    incremental: true,
    schema: rec.paymentSchema,
    save: (tx, rs) =>
      upsert(tx, xeroPayment, xeroPayment.paymentId, rs.map(rec.mapPayment)),
  }),
  resource({
    name: "bank_transactions",
    path: "BankTransactions",
    key: "BankTransactions",
    paged: true,
    incremental: true,
    schema: rec.bankTransactionSchema,
    save: (tx, rs) =>
      upsert(
        tx,
        xeroBankTransaction,
        xeroBankTransaction.bankTransactionId,
        rs.map(rec.mapBankTransaction)
      ),
  }),
  resource({
    name: "manual_journals",
    path: "ManualJournals",
    key: "ManualJournals",
    paged: true,
    incremental: true,
    schema: rec.manualJournalSchema,
    save: (tx, rs) =>
      upsert(
        tx,
        xeroManualJournal,
        xeroManualJournal.manualJournalId,
        rs.map(rec.mapManualJournal)
      ),
  }),
]

export type StepResult = {
  resource: string
  rows: number
  calls: number
  complete: boolean
  error?: string
}

async function syncResource(
  r: (typeof RESOURCES)[number],
  trigger: "cron" | "manual",
  deadline: number
): Promise<StepResult> {
  const [run] = await db
    .insert(syncRun)
    .values({ trigger, resource: r.name })
    .returning({ id: syncRun.id })
  let rows = 0
  let calls = 0
  let complete = false
  let error: string | undefined

  try {
    await db
      .insert(syncCursor)
      .values({ resource: r.name })
      .onConflictDoNothing()
    let [cursor] = await db
      .select()
      .from(syncCursor)
      .where(eq(syncCursor.resource, r.name))
    if (cursor.nextPage === null) {
      ;[cursor] = await db
        .update(syncCursor)
        .set({ nextPage: 1, highWater: null })
        .where(eq(syncCursor.resource, r.name))
        .returning()
    }

    while (!complete && Date.now() < deadline) {
      const page = cursor.nextPage ?? 1
      const body = (await xeroGet(
        r.path,
        {
          params: {
            ...r.params,
            ...(r.paged ? { page, pageSize: PAGE_SIZE } : {}),
          },
          modifiedSince: r.incremental ? cursor.modifiedSince : null,
        },
        () => calls++
      )) as Record<string, unknown> | null
      const raw = (body?.[r.key] ?? []) as unknown[]
      const records = raw.map((x) => r.schema.parse(x))
      const pageMax = rec.maxUpdated(
        records as { UpdatedDateUTC?: string | null }[]
      )
      const highWater =
        pageMax && (!cursor.highWater || pageMax > cursor.highWater)
          ? pageMax
          : cursor.highWater
      complete = !r.paged || records.length < PAGE_SIZE

      cursor = await db.transaction(async (tx) => {
        await r.save(tx, records as never)
        const [next] = await tx
          .update(syncCursor)
          .set(
            complete
              ? {
                  nextPage: null,
                  highWater: null,
                  modifiedSince: r.incremental
                    ? (highWater ?? cursor.modifiedSince)
                    : null,
                  lastCompletedAt: new Date(),
                }
              : { nextPage: page + 1, highWater }
          )
          .where(eq(syncCursor.resource, r.name))
          .returning()
        return next
      })
      rows += records.length
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  await db
    .update(syncRun)
    .set({
      finishedAt: new Date(),
      rowsChanged: rows,
      apiCalls: calls,
      error: error ?? null,
    })
    .where(eq(syncRun.id, run.id))
  return { resource: r.name, rows, calls, complete, error }
}

export type SyncResult =
  | { status: "busy" }
  | { status: "done" | "partial" | "failed"; steps: StepResult[] }

/**
 * Bring every resource up to date, resuming where the last call stopped.
 * Stops starting new pages once `budgetMs` has elapsed and reports "partial";
 * calling again continues. Only one sync runs at a time (Postgres advisory lock).
 */
export async function runSync(
  trigger: "cron" | "manual",
  budgetMs: number
): Promise<SyncResult> {
  const deadline = Date.now() + budgetMs
  const lockClient = await pool.connect()
  try {
    const { rows } = await lockClient.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [SYNC_LOCK_ID]
    )
    if (!rows[0]?.locked) return { status: "busy" }
    try {
      const steps: StepResult[] = []
      for (const r of RESOURCES) {
        if (Date.now() >= deadline) break
        const step = await syncResource(r, trigger, deadline)
        steps.push(step)
        // Auth failures and the daily limit stop the whole run; other errors skip to the next resource.
        if (
          step.error &&
          /token|not connected|daily API limit/i.test(step.error)
        )
          break
      }
      await ensureAccountGroups()
      const failed = steps.some((s) => s.error)
      const allComplete =
        steps.length === RESOURCES.length && steps.every((s) => s.complete)
      return {
        status: failed ? "failed" : allComplete ? "done" : "partial",
        steps,
      }
    } finally {
      await lockClient.query("select pg_advisory_unlock($1)", [SYNC_LOCK_ID])
    }
  } finally {
    lockClient.release()
  }
}

export { XeroApiError, XeroAuthError }

/** Latest finished run per resource, plus cursor state, for the status panel. */
export async function getSyncStatus() {
  const cursors = await db.select().from(syncCursor)
  const recent = await db
    .select()
    .from(syncRun)
    .orderBy(desc(syncRun.startedAt))
    .limit(30)
  return { cursors, recent }
}
