import { sql } from "drizzle-orm"
import { date, numeric, pgView, text, uuid } from "drizzle-orm/pg-core"

/**
 * What we pay staff, per person per month: People-cost lines from the ledger,
 * excluding director accounts (any People account whose name mentions
 * "director"). Lines without a contact are grouped as "Unassigned".
 */
export const vStaffPayMonthly = pgView("v_staff_pay_monthly", {
  contactId: uuid("contact_id"),
  name: text("name").notNull(),
  month: date("month").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  payments: numeric("payments").notNull(),
}).as(sql`
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
`)
