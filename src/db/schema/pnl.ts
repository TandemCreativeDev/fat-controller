import { sql } from "drizzle-orm"
import {
  date,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./auth"

const money = (name: string) => numeric(name, { precision: 14, scale: 2 })

/**
 * Each Xero account's P&L group. Rows with source "auto" come from
 * defaultGroup() in src/lib/pnl.ts and follow account renames; "manual" rows
 * were set by a director and are never overwritten by a sync.
 */
export const accountGroup = pgTable("account_group", {
  accountId: uuid("account_id").primaryKey(),
  group: text("group", {
    enum: ["sales", "people", "other", "exclude"],
  }).notNull(),
  source: text("source", { enum: ["auto", "manual"] }).notNull(),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/** Per-account amounts from the latest single-month Xero P&L report. */
export const xeroPnlLine = pgTable(
  "xero_pnl_line",
  {
    periodStart: date("period_start").notNull(),
    accountId: uuid("account_id").notNull(),
    accountName: text("account_name").notNull(),
    section: text("section").notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.periodStart, t.accountId] })]
)

/**
 * The home screen: last 12 months plus the current month to date (London time).
 * Months without a report show zeros and a null as_of.
 */
export const vPnlMonthly = pgView("v_pnl_monthly", {
  month: date("month").notNull(),
  sales: money("sales").notNull(),
  peopleCosts: money("people_costs").notNull(),
  otherCosts: money("other_costs").notNull(),
  profit: money("profit").notNull(),
  margin: numeric("margin"),
  ctSetAside: money("ct_set_aside").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }),
}).as(sql`
  with months as (
    select generate_series(
      date_trunc('month', now() at time zone 'Europe/London') - interval '12 months',
      date_trunc('month', now() at time zone 'Europe/London'),
      interval '1 month'
    )::date as month
  ),
  rate as (
    select coalesce(
      (select (value #>> '{}')::numeric from settings where key = 'ct_set_aside_rate'),
      0.2
    ) as r
  ),
  agg as (
    select
      l.period_start,
      coalesce(sum(l.amount) filter (where g."group" = 'sales'), 0) as sales,
      coalesce(sum(l.amount) filter (where g."group" = 'people'), 0) as people,
      coalesce(sum(l.amount) filter (where g."group" = 'other'), 0) as other
    from xero_pnl_line l
    join account_group g on g.account_id = l.account_id
    group by l.period_start
  ),
  snap as (
    select period_start, max(fetched_at) as as_of
    from xero_report_snapshot
    where report = 'ProfitAndLoss'
    group by period_start
  )
  select
    m.month,
    coalesce(a.sales, 0)::numeric(14, 2) as sales,
    coalesce(a.people, 0)::numeric(14, 2) as people_costs,
    coalesce(a.other, 0)::numeric(14, 2) as other_costs,
    (coalesce(a.sales, 0) - coalesce(a.people, 0) - coalesce(a.other, 0))::numeric(14, 2) as profit,
    case when coalesce(a.sales, 0) <> 0
      then round((a.sales - a.people - a.other) / a.sales, 4)
    end as margin,
    round(coalesce(a.sales, 0) * rate.r, 2)::numeric(14, 2) as ct_set_aside,
    s.as_of
  from months m
  cross join rate
  left join agg a on a.period_start = m.month
  left join snap s on s.period_start = m.month
  order by m.month
`)
