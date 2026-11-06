import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./auth"

const money = (name: string) => numeric(name, { precision: 14, scale: 2 })
const tstz = (name: string) => timestamp(name, { withTimezone: true })
const createdBy = () =>
  text("created_by").references(() => user.id, { onDelete: "set null" })

// ---------------------------------------------------------------- Solidtime

export const solidtimeMember = pgTable("solidtime_member", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().unique(),
  name: text("name").notNull(),
  role: text("role"),
  isPlaceholder: boolean("is_placeholder").notNull().default(false),
  raw: jsonb("raw").notNull(),
  syncedAt: tstz("synced_at").notNull().defaultNow(),
})

/** Names for the mapping screen, so unmapped projects can be flagged by name. */
export const solidtimeProject = pgTable("solidtime_project", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  raw: jsonb("raw").notNull(),
  syncedAt: tstz("synced_at").notNull().defaultNow(),
})

export const solidtimeTimeEntry = pgTable(
  "solidtime_time_entry",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    projectId: uuid("project_id"),
    start: tstz("start").notNull(),
    /** Null while a timer is running; the engine ignores those. */
    end: tstz("end"),
    durationSeconds: integer("duration_seconds").notNull(),
    billable: boolean("billable").notNull(),
    type: text("type"),
    raw: jsonb("raw").notNull(),
    syncedAt: tstz("synced_at").notNull().defaultNow(),
  },
  (t) => [
    index("solidtime_time_entry_start_idx").on(t.start),
    index("solidtime_time_entry_project_idx").on(t.projectId),
  ]
)

// ---------------------------------------------------------------- directors' setup

export const project = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind", { enum: ["client", "internal"] })
    .notNull()
    .default("client"),
  /** Invoice number prefix (`<code>-I<n>`); null for internal projects. */
  code: text("code").unique(),
  name: text("name").notNull(),
  xeroContactId: uuid("xero_contact_id"),
  chargeRateGbp: money("charge_rate_gbp"),
  invoiceAnchorDate: date("invoice_anchor_date"),
  invoiceIntervalDays: integer("invoice_interval_days").notNull().default(14),
  /** Work is forecast up to this date, and one last invoice covers it. */
  endDate: date("end_date"),
  extraInvoiceDates: date("extra_invoice_dates")
    .array()
    .notNull()
    .default(sql`'{}'`),
  skippedInvoiceDates: date("skipped_invoice_dates")
    .array()
    .notNull()
    .default(sql`'{}'`),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  active: boolean("active").notNull().default(true),
})

/**
 * Which Solidtime projects feed each project. One invoice code can cover several
 * Solidtime projects, but a Solidtime project only ever feeds one code.
 */
export const projectSolidtime = pgTable("project_solidtime", {
  solidtimeProjectId: uuid("solidtime_project_id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
})

export const person = pgTable("person", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  solidtimeUserId: uuid("solidtime_user_id").unique(),
  solidtimeMemberId: uuid("solidtime_member_id"),
  xeroContactId: uuid("xero_contact_id"),
  kind: text("kind", { enum: ["director", "contractor"] }).notNull(),
  billCycle: text("bill_cycle").notNull().default("last_friday_of_month"),
  billTermsDays: integer("bill_terms_days").notNull().default(30),
  /** A bill covers work up to this many days before its date. */
  billCutoffDays: integer("bill_cutoff_days").notNull().default(7),
})

/** A person's day rate; a null project is their default. */
export const payRate = pgTable(
  "pay_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "cascade",
    }),
    dayRateGbp: money("day_rate_gbp").notNull(),
  },
  (t) => [unique().on(t.personId, t.projectId).nullsNotDistinct()]
)

// ---------------------------------------------------------------- cash

export const contractorBill = pgTable(
  "contractor_bill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    issuedOn: date("issued_on").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    amountGbp: money("amount_gbp").notNull(),
    dueOn: date("due_on").notNull(),
    payOrder: integer("pay_order"),
    plannedPayOn: date("planned_pay_on"),
    paidOn: date("paid_on"),
    paidAmountGbp: money("paid_amount_gbp"),
    paidByBankTransactionId: uuid("paid_by_bank_transaction_id"),
    paidSource: text("paid_source", { enum: ["auto", "unmatched", "manual"] }),
  },
  (t) => [unique().on(t.personId, t.issuedOn)]
)

/** Contractor payments a director has unmatched; automatic matching skips them. */
export const contractorPaymentExclusion = pgTable(
  "contractor_payment_exclusion",
  {
    bankTransactionId: uuid("bank_transaction_id").primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    createdBy: createdBy(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  }
)

export const bankBalance = pgTable(
  "bank_balance",
  {
    asOf: date("as_of").notNull(),
    accountId: uuid("account_id").notNull(),
    source: text("source", { enum: ["xero", "manual"] }).notNull(),
    periodStart: date("period_start"),
    openingGbp: money("opening_gbp"),
    closingGbp: money("closing_gbp").notNull(),
  },
  (t) => [primaryKey({ columns: [t.asOf, t.accountId, t.source] })]
)

export const forecastOverride = pgTable(
  "forecast_override",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    periodEnd: date("period_end").notNull(),
    days: numeric("days", { precision: 10, scale: 4 }),
    amountGbp: money("amount_gbp"),
    note: text("note"),
    createdBy: createdBy(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.periodEnd] })]
)

/**
 * An invoice only the directors know about yet, added to the forecast by hand.
 * It lasts until a director deletes it: when the real invoice exists, delete this.
 */
export const customInvoice = pgTable("custom_invoice", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  /** Before VAT. */
  amountGbp: money("amount_gbp").notNull(),
  contractorCostGbp: money("contractor_cost_gbp").notNull().default("0"),
  landsOn: date("lands_on").notNull(),
  note: text("note"),
  createdBy: createdBy(),
})

/**
 * A director's what-if on money expected in: leave an invoice out, or move when it
 * lands. Keyed by the Xero invoice ID, or `<project id>|<date>` for a forecast one.
 */
export const invoiceExpectation = pgTable("invoice_expectation", {
  invoiceKey: text("invoice_key").primaryKey(),
  excluded: boolean("excluded").notNull().default(false),
  expectedOn: date("expected_on"),
  note: text("note"),
  createdBy: createdBy(),
})

export const holdBack = pgTable("hold_back", {
  /** First day of the month. */
  month: date("month").primaryKey(),
  amountGbp: money("amount_gbp").notNull(),
  note: text("note"),
  createdBy: createdBy(),
})

export const cashAdjustment = pgTable("cash_adjustment", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  label: text("label").notNull(),
  amountGbp: money("amount_gbp").notNull(),
  note: text("note"),
})

export const forecastSnapshot = pgTable(
  "forecast_snapshot",
  {
    snapshotDate: date("snapshot_date").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    invoiceDate: date("invoice_date").notNull(),
    amountGbp: money("amount_gbp").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapshotDate, t.projectId, t.invoiceDate] })]
)

/** England and Wales bank holidays, refreshed daily from gov.uk. */
export const bankHoliday = pgTable("bank_holiday", {
  date: date("date").primaryKey(),
  title: text("title").notNull(),
})

/**
 * Every sales invoice with what the forecast needs, in GBP. Unlike
 * v_sales_document it has the invoice number, due date and tax.
 */
export const vForecastSalesInvoice = pgView("v_forecast_sales_invoice", {
  invoiceId: uuid("invoice_id").notNull(),
  invoiceNumber: text("invoice_number"),
  contactId: uuid("contact_id"),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  subTotal: money("sub_total").notNull(),
  totalTax: money("total_tax").notNull(),
  total: money("total").notNull(),
  amountPaid: money("amount_paid").notNull(),
  outstandingGbp: money("outstanding_gbp").notNull(),
}).as(sql`
  select
    invoice_id,
    invoice_number,
    contact_id,
    date as invoice_date,
    due_date,
    round(coalesce(sub_total, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as sub_total,
    round(coalesce(total_tax, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as total_tax,
    round(coalesce(total, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as total,
    round(coalesce(amount_paid, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as amount_paid,
    round(coalesce(amount_due, 0) / coalesce(nullif(currency_rate, 0), 1), 2)::numeric(14, 2) as outstanding_gbp
  from xero_invoice
  where type = 'ACCREC' and status not in ('DELETED', 'VOIDED') and date is not null
`)
