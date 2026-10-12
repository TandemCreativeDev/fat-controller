import { sql } from "drizzle-orm"
import { date, integer, numeric, pgView, text, uuid } from "drizzle-orm/pg-core"

const money = (name: string) => numeric(name, { precision: 14, scale: 2 })

/** The current financial year (London date), from the financial_year_start setting. */
export const vCurrentFy = pgView("v_current_fy", {
  fyStart: date("fy_start").notNull(),
  fyEnd: date("fy_end").notNull(),
}).as(sql`
  with today as (select (now() at time zone 'Europe/London')::date as d),
  s as (
    select
      coalesce((select (value ->> 'month')::int from settings where key = 'financial_year_start'), 4) as m,
      coalesce((select (value ->> 'day')::int from settings where key = 'financial_year_start'), 1) as dd
  ),
  start as (
    select case
      when t.d >= make_date(extract(year from t.d)::int, s.m, s.dd)
        then make_date(extract(year from t.d)::int, s.m, s.dd)
      else make_date(extract(year from t.d)::int - 1, s.m, s.dd)
    end as fy_start
    from today t cross join s
  )
  select fy_start, (fy_start + interval '1 year' - interval '1 day')::date as fy_end
  from start
`)

/** Open sales invoices with what's owed (GBP) and how overdue, bucketed. */
export const vAgedDebtors = pgView("v_aged_debtors", {
  invoiceId: uuid("invoice_id").notNull(),
  invoiceNumber: text("invoice_number"),
  contactId: uuid("contact_id"),
  client: text("client").notNull(),
  date: date("date"),
  dueDate: date("due_date"),
  daysOverdue: integer("days_overdue").notNull(),
  bucket: text("bucket").notNull(),
  outstandingGbp: money("outstanding_gbp").notNull(),
}).as(sql`
  with today as (select (now() at time zone 'Europe/London')::date as d)
  select
    i.invoice_id,
    i.invoice_number,
    i.contact_id,
    coalesce(c.name, 'Unknown contact') as client,
    i.date,
    i.due_date,
    greatest(0, t.d - coalesce(i.due_date, i.date))::int as days_overdue,
    case
      when t.d <= coalesce(i.due_date, i.date) then 'Not yet due'
      when t.d - coalesce(i.due_date, i.date) <= 30 then '1–30 days overdue'
      when t.d - coalesce(i.due_date, i.date) <= 60 then '31–60 days overdue'
      when t.d - coalesce(i.due_date, i.date) <= 90 then '61–90 days overdue'
      else 'Over 90 days overdue'
    end as bucket,
    round(i.amount_due / coalesce(nullif(i.currency_rate, 0), 1), 2)::numeric(14, 2) as outstanding_gbp
  from xero_invoice i
  cross join today t
  left join xero_contact c on c.contact_id = i.contact_id
  where i.type = 'ACCREC' and i.status = 'AUTHORISED' and i.amount_due > 0
`)

/**
 * What each director has actually been paid this financial year: salary
 * (expense accounts named like "director") and dividends (equity accounts named
 * like "dividend"), by contact, from the ledger. Before personal tax.
 */
export const vTakeHomeYtd = pgView("v_take_home_ytd", {
  contactId: uuid("contact_id"),
  director: text("director").notNull(),
  fyStart: date("fy_start").notNull(),
  salaryGbp: money("salary_gbp").notNull(),
  dividendsGbp: money("dividends_gbp").notNull(),
  totalGbp: money("total_gbp").notNull(),
}).as(sql`
  select
    l.contact_id,
    coalesce(c.name, 'Unassigned') as director,
    fy.fy_start,
    coalesce(-sum(l.credit) filter (where a.class = 'EXPENSE'), 0)::numeric(14, 2) as salary_gbp,
    coalesce(-sum(l.credit) filter (where a.class = 'EQUITY'), 0)::numeric(14, 2) as dividends_gbp,
    (-sum(l.credit))::numeric(14, 2) as total_gbp
  from v_ledger_line l
  join xero_account a on a.account_id = l.account_id
  cross join v_current_fy fy
  left join xero_contact c on c.contact_id = l.contact_id
  where l.date >= fy.fy_start
    and (
      (a.class = 'EXPENSE' and a.name ~* 'director')
      or (a.class = 'EQUITY' and a.name ~* 'dividend')
    )
  group by 1, 2, 3
`)

/**
 * What each director has been paid in each month, since records began: salary
 * and dividends picked out as in v_take_home_ytd. Before personal tax.
 */
export const vTakeHomeMonthly = pgView("v_take_home_monthly", {
  contactId: uuid("contact_id"),
  director: text("director").notNull(),
  month: date("month").notNull(),
  salaryGbp: money("salary_gbp").notNull(),
  dividendsGbp: money("dividends_gbp").notNull(),
  totalGbp: money("total_gbp").notNull(),
}).as(sql`
  select
    l.contact_id,
    coalesce(c.name, 'Unassigned') as director,
    date_trunc('month', l.date)::date as month,
    coalesce(-sum(l.credit) filter (where a.class = 'EXPENSE'), 0)::numeric(14, 2) as salary_gbp,
    coalesce(-sum(l.credit) filter (where a.class = 'EQUITY'), 0)::numeric(14, 2) as dividends_gbp,
    (-sum(l.credit))::numeric(14, 2) as total_gbp
  from v_ledger_line l
  join xero_account a on a.account_id = l.account_id
  left join xero_contact c on c.contact_id = l.contact_id
  where (a.class = 'EXPENSE' and a.name ~* 'director')
    or (a.class = 'EQUITY' and a.name ~* 'dividend')
  group by 1, 2, 3
`)
