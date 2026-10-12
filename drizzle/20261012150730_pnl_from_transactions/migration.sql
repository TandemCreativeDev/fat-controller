DROP VIEW "v_pnl_monthly";--> statement-breakpoint
CREATE VIEW "v_ledger_line" AS (
  with doc_lines as (
    select 'invoice' as source, i.invoice_id as document_id, i.date, i.contact_id,
      l.value as li, i.line_amount_types as lat,
      coalesce(nullif(i.currency_rate, 0), 1) as rate,
      case i.type when 'ACCREC' then 1 else -1 end as dir
    from xero_invoice i
    cross join lateral jsonb_array_elements(coalesce(i.raw -> 'LineItems', '[]')) l
    where i.type in ('ACCREC', 'ACCPAY') and i.status in ('AUTHORISED', 'PAID')
    union all
    select 'credit_note', c.credit_note_id, c.date, c.contact_id,
      l.value, c.raw ->> 'LineAmountTypes',
      coalesce(nullif(c.currency_rate, 0), 1),
      case c.type when 'ACCRECCREDIT' then -1 else 1 end
    from xero_credit_note c
    cross join lateral jsonb_array_elements(coalesce(c.raw -> 'LineItems', '[]')) l
    where c.status in ('AUTHORISED', 'PAID')
    union all
    select 'bank_transaction', b.bank_transaction_id, b.date, b.contact_id,
      l.value, b.raw ->> 'LineAmountTypes',
      coalesce(nullif(b.currency_rate, 0), 1),
      case b.type when 'RECEIVE' then 1 else -1 end
    from xero_bank_transaction b
    cross join lateral jsonb_array_elements(coalesce(b.raw -> 'LineItems', '[]')) l
    where b.type in ('RECEIVE', 'SPEND') and b.status = 'AUTHORISED'
  )
  select
    d.source,
    d.document_id,
    d.date,
    a.account_id,
    d.contact_id,
    d.li ->> 'Description' as description,
    round(
      d.dir * (
        coalesce((d.li ->> 'LineAmount')::numeric, 0)
        - case when d.lat = 'Inclusive' then coalesce((d.li ->> 'TaxAmount')::numeric, 0) else 0 end
      ) / d.rate,
      2
    )::numeric(14, 2) as credit
  from doc_lines d
  join xero_account a
    on a.account_id::text = d.li ->> 'AccountID'
    or (d.li ->> 'AccountID' is null and a.code = d.li ->> 'AccountCode')
  where d.date is not null
  union all
  select
    'manual_journal',
    j.manual_journal_id,
    j.date,
    a.account_id,
    null,
    coalesce(l.value ->> 'Description', j.narration),
    (-coalesce((l.value ->> 'LineAmount')::numeric, 0))::numeric(14, 2)
  from xero_manual_journal j
  cross join lateral jsonb_array_elements(coalesce(j.raw -> 'JournalLines', '[]')) l
  join xero_account a on a.account_id::text = l.value ->> 'AccountID'
  where j.status = 'POSTED' and j.date is not null
);--> statement-breakpoint
CREATE VIEW "v_pnl_monthly" AS (
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