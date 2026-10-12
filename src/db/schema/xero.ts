import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./auth"

const money = (name: string) => numeric(name, { precision: 14, scale: 2 })
const rate = (name: string) => numeric(name, { precision: 18, scale: 10 })
const tstz = (name: string) => timestamp(name, { withTimezone: true })

// ---------------------------------------------------------------- app layer

/** The single Xero connection. `id` is always "xero"; tokens are AES-GCM encrypted. */
export const xeroConnection = pgTable("xero_connection", {
  id: text("id").primaryKey().default("xero"),
  tenantId: uuid("tenant_id").notNull(),
  tenantName: text("tenant_name").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: tstz("access_token_expires_at"),
  scopes: text("scopes").notNull(),
  connectedBy: text("connected_by").references(() => user.id, {
    onDelete: "set null",
  }),
  connectedAt: tstz("connected_at").notNull().defaultNow(),
  lastRefreshedAt: tstz("last_refreshed_at"),
  status: text("status", { enum: ["active", "error"] })
    .notNull()
    .default("active"),
  lastError: text("last_error"),
})

/** One row per resource step of a sync. */
export const syncRun = pgTable(
  "sync_run",
  {
    id: serial("id").primaryKey(),
    trigger: text("trigger", { enum: ["cron", "manual"] }).notNull(),
    resource: text("resource").notNull(),
    startedAt: tstz("started_at").notNull().defaultNow(),
    finishedAt: tstz("finished_at"),
    rowsChanged: integer("rows_changed").notNull().default(0),
    apiCalls: integer("api_calls").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("sync_run_started_at_idx").on(t.startedAt)]
)

/**
 * Per-resource sync position. A pass pages through everything modified since
 * `modifiedSince` (null = full backfill); `nextPage` is null between passes.
 * `highWater` collects the newest UpdatedDateUTC seen during the pass and
 * becomes the next pass's `modifiedSince` when the pass completes.
 */
export const syncCursor = pgTable("sync_cursor", {
  resource: text("resource").primaryKey(),
  modifiedSince: tstz("modified_since"),
  nextPage: integer("next_page"),
  highWater: tstz("high_water"),
  lastCompletedAt: tstz("last_completed_at"),
})

// ---------------------------------------------------------------- raw Xero layer

export const xeroOrganisation = pgTable("xero_organisation", {
  organisationId: uuid("organisation_id").primaryKey(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull(),
  financialYearEndDay: integer("financial_year_end_day"),
  financialYearEndMonth: integer("financial_year_end_month"),
  raw: jsonb("raw").notNull(),
  syncedAt: tstz("synced_at").notNull().defaultNow(),
})

export const xeroAccount = pgTable("xero_account", {
  accountId: uuid("account_id").primaryKey(),
  code: text("code"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  class: text("class"),
  taxType: text("tax_type"),
  status: text("status"),
  updatedAt: tstz("updated_at"),
  raw: jsonb("raw").notNull(),
})

export const xeroContact = pgTable("xero_contact", {
  contactId: uuid("contact_id").primaryKey(),
  name: text("name").notNull(),
  isCustomer: boolean("is_customer").notNull().default(false),
  isSupplier: boolean("is_supplier").notNull().default(false),
  status: text("status"),
  updatedAt: tstz("updated_at"),
  raw: jsonb("raw").notNull(),
})

export const xeroInvoice = pgTable(
  "xero_invoice",
  {
    invoiceId: uuid("invoice_id").primaryKey(),
    /** ACCREC = sales invoice, ACCPAY = bill. */
    type: text("type").notNull(),
    invoiceNumber: text("invoice_number"),
    reference: text("reference"),
    contactId: uuid("contact_id"),
    date: date("date"),
    dueDate: date("due_date"),
    status: text("status").notNull(),
    lineAmountTypes: text("line_amount_types"),
    subTotal: money("sub_total"),
    totalTax: money("total_tax"),
    total: money("total"),
    amountDue: money("amount_due"),
    amountPaid: money("amount_paid"),
    amountCredited: money("amount_credited"),
    currencyCode: text("currency_code"),
    currencyRate: rate("currency_rate"),
    fullyPaidOnDate: date("fully_paid_on_date"),
    updatedAt: tstz("updated_at"),
    raw: jsonb("raw").notNull(),
  },
  (t) => [
    index("xero_invoice_contact_idx").on(t.contactId),
    index("xero_invoice_type_date_idx").on(t.type, t.date),
  ]
)

export const xeroInvoiceLine = pgTable(
  "xero_invoice_line",
  {
    lineItemId: uuid("line_item_id").primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => xeroInvoice.invoiceId, { onDelete: "cascade" }),
    description: text("description"),
    accountCode: text("account_code"),
    quantity: numeric("quantity", { precision: 18, scale: 4 }),
    unitAmount: numeric("unit_amount", { precision: 18, scale: 4 }),
    lineAmount: money("line_amount"),
    taxAmount: money("tax_amount"),
    taxType: text("tax_type"),
    tracking: jsonb("tracking").notNull().default([]),
  },
  (t) => [index("xero_invoice_line_invoice_idx").on(t.invoiceId)]
)

export const xeroCreditNote = pgTable("xero_credit_note", {
  creditNoteId: uuid("credit_note_id").primaryKey(),
  /** ACCRECCREDIT = credit to a customer, ACCPAYCREDIT = credit from a supplier. */
  type: text("type").notNull(),
  creditNoteNumber: text("credit_note_number"),
  contactId: uuid("contact_id"),
  date: date("date"),
  status: text("status").notNull(),
  subTotal: money("sub_total"),
  totalTax: money("total_tax"),
  total: money("total"),
  remainingCredit: money("remaining_credit"),
  currencyCode: text("currency_code"),
  currencyRate: rate("currency_rate"),
  updatedAt: tstz("updated_at"),
  raw: jsonb("raw").notNull(),
})

export const xeroPayment = pgTable(
  "xero_payment",
  {
    paymentId: uuid("payment_id").primaryKey(),
    invoiceId: uuid("invoice_id"),
    creditNoteId: uuid("credit_note_id"),
    paymentType: text("payment_type"),
    date: date("date"),
    amount: money("amount"),
    currencyRate: rate("currency_rate"),
    bankAccountId: uuid("bank_account_id"),
    status: text("status"),
    updatedAt: tstz("updated_at"),
    raw: jsonb("raw").notNull(),
  },
  (t) => [index("xero_payment_invoice_idx").on(t.invoiceId)]
)

export const xeroBankTransaction = pgTable(
  "xero_bank_transaction",
  {
    bankTransactionId: uuid("bank_transaction_id").primaryKey(),
    /** RECEIVE, SPEND, and their -OVERPAYMENT/-PREPAYMENT/-TRANSFER variants. */
    type: text("type").notNull(),
    contactId: uuid("contact_id"),
    bankAccountId: uuid("bank_account_id"),
    date: date("date"),
    status: text("status"),
    reference: text("reference"),
    isReconciled: boolean("is_reconciled"),
    subTotal: money("sub_total"),
    totalTax: money("total_tax"),
    total: money("total"),
    currencyCode: text("currency_code"),
    currencyRate: rate("currency_rate"),
    updatedAt: tstz("updated_at"),
    raw: jsonb("raw").notNull(),
  },
  (t) => [index("xero_bank_transaction_date_idx").on(t.date)]
)

export const xeroManualJournal = pgTable("xero_manual_journal", {
  manualJournalId: uuid("manual_journal_id").primaryKey(),
  date: date("date"),
  status: text("status"),
  narration: text("narration"),
  updatedAt: tstz("updated_at"),
  raw: jsonb("raw").notNull(),
})

export const xeroReportSnapshot = pgTable(
  "xero_report_snapshot",
  {
    id: serial("id").primaryKey(),
    report: text("report").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    params: jsonb("params").notNull().default({}),
    fetchedAt: tstz("fetched_at").notNull().defaultNow(),
    raw: jsonb("raw").notNull(),
  },
  (t) => [index("xero_report_snapshot_report_idx").on(t.report, t.fetchedAt)]
)
