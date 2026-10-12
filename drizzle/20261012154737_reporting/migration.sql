CREATE VIEW "v_current_fy" AS (
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
);
--> statement-breakpoint
CREATE VIEW "v_aged_debtors" AS (
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
);
--> statement-breakpoint
CREATE VIEW "v_take_home_ytd" AS (
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
);
