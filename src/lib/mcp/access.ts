/**
 * Every decision about what the MCP analyst can see lives here. The read-only
 * role `fc_analyst` gets SELECT on ALLOWED only (deny by default), and
 * scripts/analyst-role.sql is generated from this file. A test checks every
 * table and view in the database appears below, and that no allowed view reads
 * a denied table (views run with their owner's rights).
 */

export const ANALYST_ROLE = "fc_analyst"

/** Tables and views the analyst can read with free SQL. */
export const ALLOWED = [
  // Xero cache
  "xero_account",
  "xero_bank_transaction",
  "xero_bank_transfer",
  "xero_contact",
  "xero_credit_note",
  "xero_invoice",
  "xero_invoice_line",
  "xero_manual_journal",
  "xero_organisation",
  "xero_payment",
  "xero_pnl_line",
  "xero_report_snapshot",
  // App data
  "account_group",
  "bank_balance",
  "bank_holiday",
  "cash_adjustment",
  "contractor_bill",
  "contractor_payment_exclusion",
  "custom_invoice",
  "forecast_override",
  "forecast_snapshot",
  "hold_back",
  "invoice_expectation",
  "pay_rate",
  "person",
  "project",
  "project_solidtime",
  "reserve_repayment",
  "running_cost_fixed",
  "running_cost_one_off",
  "solidtime_member",
  "solidtime_project",
  "solidtime_time_entry",
  "sync_cursor",
  "sync_run",
  // Reporting views
  "v_aged_debtors",
  "v_client_summary",
  "v_current_fy",
  "v_forecast_sales_invoice",
  "v_ledger_line",
  "v_pnl_monthly",
  "v_revenue_by_client_month",
  "v_sales_document",
  "v_staff_pay_monthly",
  "v_take_home_monthly",
  "v_take_home_ytd",
] as const

/** Never readable, grouped by why. */
export const DENIED = {
  logins: ["user", "session", "account", "verification", "rate_limit"],
  oauth: [
    "jwks",
    "oauth_client",
    "oauth_resource",
    "oauth_client_resource",
    "oauth_refresh_token",
    "oauth_access_token",
    "oauth_consent",
    "oauth_client_assertion",
  ],
  xero: ["xero_connection"],
  log: ["mcp_call"],
  internals: ["sync_lock"],
  // No secrets today, but one could be stored there later. get_settings
  // exposes the safe keys; views may still read it.
  settings: ["settings"],
} as const

/** Denied tables that no allowed view may read either. */
export const SENSITIVE: readonly string[] = [
  ...DENIED.logins,
  ...DENIED.oauth,
  ...DENIED.xero,
  ...DENIED.log,
]

export const DENIED_ALL: readonly string[] = Object.values(DENIED).flat()

/** Settings get_settings may return. Anything else stays hidden. */
export const SAFE_SETTINGS = [
  "financial_year_start",
  "ct_set_aside_rate",
  "hours_per_day",
  "invoice_day_rounding",
  "forecast_lookback_days",
  "forecast_months",
  "operating_buffer_gbp",
  "forecast_start_date",
  "director_monthly_salary_gbp",
  "bank_account_roles",
  "vat_liability_account_id",
  "vat_registered_from",
  "vat_rate",
  "ct_associated_companies",
  "ct_paid_years",
] as const

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`

/** The role's privileges: idempotent, no password. Run after CREATE ROLE. */
export function analystRoleSql(): string {
  const r = ANALYST_ROLE
  return [
    "-- Generated from src/lib/mcp/access.ts by `pnpm db:analyst:sql`. Do not edit.",
    "-- Run once the role exists: CREATE ROLE fc_analyst LOGIN PASSWORD '<generated>';",
    "-- Idempotent: rerun after any deploy that adds a table.",
    `ALTER ROLE ${r} SET default_transaction_read_only = on;`,
    `ALTER ROLE ${r} SET statement_timeout = '15s';`,
    `ALTER ROLE ${r} SET idle_in_transaction_session_timeout = '15s';`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r};`,
    `GRANT USAGE ON SCHEMA public TO ${r};`,
    ...ALLOWED.map((t) => `GRANT SELECT ON ${ident(t)} TO ${r};`),
    "",
  ].join("\n")
}
