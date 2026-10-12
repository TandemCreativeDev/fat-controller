import { sql } from "drizzle-orm"
import { date, numeric, pgView, text, uuid } from "drizzle-orm/pg-core"

/**
 * Every P&L-relevant line from synced Xero transactions, as a credit amount in
 * GBP excluding VAT (credits positive, debits negative):
 *
 * - sales invoices (+) and bills (−), authorised or paid, by invoice date
 * - customer credit notes (−) and supplier credit notes (+)
 * - bank RECEIVE (+) and SPEND (−) transactions; transfers are excluded
 * - posted manual journals (Xero's LineAmount is debit-positive, so negated)
 *
 * Lines carry Xero's AccountID where available, else the account code.
 * Checked against Xero's own Profit and Loss report: identical per account
 * per month on Tandem's data (2026-10-12).
 */
export const vLedgerLine = pgView("v_ledger_line", {
  source: text("source").notNull(),
  documentId: uuid("document_id").notNull(),
  date: date("date").notNull(),
  accountId: uuid("account_id").notNull(),
  contactId: uuid("contact_id"),
  description: text("description"),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull(),
}).as(sql`
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
`)
