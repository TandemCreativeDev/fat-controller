DROP VIEW "v_pnl_monthly";--> statement-breakpoint
CREATE VIEW "v_take_home_monthly" AS (
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
);--> statement-breakpoint
CREATE VIEW "v_pnl_monthly" AS (
  with this_month as (
    select date_trunc('month', now() at time zone 'Europe/London')::date as m
  ),
  first_month as (
    select least(
      coalesce(
        (
          select date_trunc('month', min(l.date))::date
          from v_ledger_line l
          join account_group g on g.account_id = l.account_id
          where g."group" in ('sales', 'people', 'other')
        ),
        t.m
      ),
      t.m
    ) as m
    from this_month t
  ),
  months as (
    select generate_series(f.m, t.m, interval '1 month')::date as month
    from first_month f cross join this_month t
  ),
  rate as (
    select coalesce(
      (select (value #>> '{}')::numeric from settings where key = 'ct_set_aside_rate'),
      0.2
    ) as r
  ),
  agg as (
    -- Sales are credits; costs are debits (negated credits).
    select
      date_trunc('month', l.date)::date as period_start,
      coalesce(sum(l.credit) filter (where g."group" = 'sales'), 0) as sales,
      coalesce(-sum(l.credit) filter (where g."group" = 'people'), 0) as people,
      coalesce(-sum(l.credit) filter (where g."group" = 'other'), 0) as other
    from v_ledger_line l
    join account_group g on g.account_id = l.account_id
    group by 1
  ),
  synced as (
    select max(last_completed_at) as as_of
    from sync_cursor
    where resource in ('invoices', 'credit_notes', 'bank_transactions', 'manual_journals')
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
    synced.as_of
  from months m
  cross join rate
  left join agg a on a.period_start = m.month
  cross join synced
  order by m.month
);