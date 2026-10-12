DROP VIEW "v_client_summary";--> statement-breakpoint
CREATE VIEW "v_client_summary" AS (
  with today as (select (now() at time zone 'Europe/London')::date as d),
  fy_setting as (
    select
      coalesce((select (value ->> 'month')::int from settings where key = 'financial_year_start'), 4) as m,
      coalesce((select (value ->> 'day')::int from settings where key = 'financial_year_start'), 1) as dd
  ),
  fy as (
    select case
      when t.d >= make_date(extract(year from t.d)::int, s.m, s.dd)
        then make_date(extract(year from t.d)::int, s.m, s.dd)
      else make_date(extract(year from t.d)::int - 1, s.m, s.dd)
    end as start
    from today t cross join fy_setting s
  ),
  docs as (
    select d.*, fy.start as fy_start from v_sales_document d cross join fy
  ),
  per_client as (
    select
      contact_id,
      min(fy_start) as fy_start,
      coalesce(sum(net_gbp) filter (where date >= fy_start), 0) as invoiced_fy,
      coalesce(sum(net_gbp) filter (where date >= fy_start - interval '1 year' and date < fy_start), 0) as invoiced_prev_fy,
      sum(outstanding_gbp) as outstanding,
      round(avg(days_to_pay), 1) as avg_days_to_pay,
      max(date) filter (where kind = 'invoice') as last_invoice_date,
      count(*) filter (where kind = 'invoice' and date >= fy_start)::int as invoices_fy
    from docs
    group by contact_id
  ),
  paid_fy as (
    select r.contact_id, sum(r.paid_gbp) as amount
    from v_revenue_by_client_month r cross join fy
    where r.month >= date_trunc('month', fy.start)
    group by r.contact_id
  ),
  total as (
    select nullif(sum(invoiced_fy), 0) as t, nullif(sum(invoiced_prev_fy), 0) as t_prev
    from per_client
  )
  select
    pc.contact_id,
    coalesce(c.name, 'Unknown contact') as name,
    pc.fy_start,
    pc.invoiced_fy::numeric(14, 2),
    pc.invoiced_prev_fy::numeric(14, 2),
    round(pc.invoiced_fy / total.t, 4) as share_fy,
    round(pc.invoiced_prev_fy / total.t_prev, 4) as share_prev_fy,
    coalesce(p.amount, 0)::numeric(14, 2) as paid_fy,
    pc.outstanding::numeric(14, 2),
    pc.avg_days_to_pay,
    pc.last_invoice_date,
    pc.invoices_fy,
    round(pc.invoiced_fy / nullif(pc.invoices_fy, 0), 2)::numeric(14, 2) as avg_invoice_fy
  from per_client pc
  cross join total
  left join xero_contact c on c.contact_id = pc.contact_id
  left join paid_fy p on p.contact_id is not distinct from pc.contact_id
);