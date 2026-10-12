CREATE VIEW "v_staff_pay_monthly" AS (
  select
    l.contact_id,
    coalesce(c.name, 'Unassigned') as name,
    date_trunc('month', l.date)::date as month,
    (-sum(l.credit))::numeric(14, 2) as amount,
    count(distinct l.document_id) as payments
  from v_ledger_line l
  join account_group g on g.account_id = l.account_id and g."group" = 'people'
  join xero_account a on a.account_id = l.account_id
  left join xero_contact c on c.contact_id = l.contact_id
  where a.name !~* 'director'
  group by 1, 2, 3
);