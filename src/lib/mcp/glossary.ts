/**
 * What the data means, for the analyst. Names and meanings only: no company
 * data, client names or figures (the repo is public).
 */

export const INSTRUCTIONS = `You are a financial analyst for Tandem, a small UK software consultancy run by two directors. You have read-only access to Fat Controller: its cache of the company's Xero books, plus the app's own calculations (forecast, take-home, tax set-asides, Corporation Tax).

How to work:
- For headline figures (P&L, take-home, forecast, CT, balances), use the get_* tools: they return exactly what the dashboard shows.
- For anything else, explore with run_query. Start with data_dictionary and describe_schema, then write SQL. Aggregate in SQL rather than pulling raw rows.
- Money is GBP, returned as strings with two decimals (numeric(14,2)). Never round through floats when adding up.
- Data is as fresh as the last Xero sync; check sync_status and say how fresh your numbers are when it matters.
- The financial year starts on the date in get_settings (financial_year_start). Months are first-of-month dates.
- You can't change anything. Point the directors to the dashboard for changes.`

export const DICTIONARY = `# Fat Controller data dictionary

## Concepts
- Directors: the two owners. They take a small monthly salary plus dividends ("take-home").
- Operating account vs tax reserve: bank accounts are tagged in settings (bank_account_roles). The operating account is the main current account; the tax reserve is a savings account where money for Corporation Tax is kept.
- Set-aside: the share of each paid invoice's margin (after contractor costs) that should move to the tax reserve. The rate is ct_set_aside_rate (the "20% rule").
- Borrowed from the reserve (reserve loan): money moved from the tax reserve back to the operating account. Money moved into the reserve first settles set-asides owed on invoices already paid; anything beyond that pays back the loan. By default it's all repaid on the month's payout day; directors can choose to repay less in a month (reserve_repayment), and the rest rolls on.
- Correction: a withdrawal from the reserve a director marked as undoing a transfer in (a mistake put straight back, or too much moved across), in reserve_correction. It isn't borrowing: it's left out of the loan and cancels that much of the transfers in.
- Buffer: operating_buffer_gbp, left in the operating account after month-end take-home.
- Hold-back: only ever set by a director (hold_back), for one month. It's everything left in the account at take-home, in place of the buffer. The forecast never holds back by itself; it reports a shortfall when next month's bills would run the account short.
- Payout day: the last working day of the month, when take-home (dividends) is paid.
- Forecast: projects each project's invoices from tracked hours (Solidtime) and pay rates, contractor bills, running costs, set-asides and VAT, day by day, to work out take-home.
- Corporation Tax (CT): estimated per financial year from the ledger, with marginal relief; ct_paid_years lists years already paid.

## Where things are
- xero_*: raw Xero cache, synced daily (and on demand). Every row keeps raw jsonb beside typed columns.
  - xero_invoice (type ACCREC = sales, ACCPAY = bills), xero_invoice_line, xero_payment, xero_credit_note
  - xero_bank_transaction (type RECEIVE/SPEND, plus transfers), xero_bank_transfer (between own accounts)
  - xero_account (chart of accounts and bank accounts), xero_contact (clients, suppliers, people)
  - xero_manual_journal, xero_pnl_line / xero_report_snapshot (Xero's own report snapshots, for reconciliation)
- v_ledger_line: the P&L ledger built from Xero documents (source, date, account, contact, credit). The basis of every P&L figure.
- v_pnl_monthly: sales, people_costs, other_costs, profit, margin and ct_set_aside per month.
- v_revenue_by_client_month, v_client_summary, v_aged_debtors: revenue by client, and who owes what.
- v_staff_pay_monthly, v_take_home_monthly, v_take_home_ytd: pay and director take-home.
- v_current_fy: the current financial year's start and end.
- v_sales_document, v_forecast_sales_invoice: sales invoices and credit notes, as the forecast sees them.
- bank_balance: daily balances per bank account (source xero, or manual when a director typed one in).
- person, pay_rate, project, project_solidtime, solidtime_*: who works on what, at what rate, and their tracked time.
- contractor_bill: contractor bills (entered or matched to bank payments).
- forecast_override, invoice_expectation, custom_invoice, hold_back, reserve_repayment, cash_adjustment, running_cost_fixed, running_cost_one_off: directors' adjustments to the forecast.
- forecast_snapshot: what the forecast said each day, for accuracy tracking.
- account_group: how Xero accounts group into P&L lines.
- sync_run, sync_cursor: when each Xero resource last synced, and any errors.

Not available (on purpose): logins, OAuth tokens, the Xero connection, settings (use get_settings), the MCP call log.`
