import type { ForecastResult } from "@/lib/forecast"
import type { ForecastPageData } from "@/lib/forecast-store"
import type { SettingKey } from "@/lib/settings"

/**
 * Parity between the app and the MCP analyst. Anything the app shows must be
 * reachable from an MCP tool, or be marked hidden here with a reason, so
 * nothing can be built in one without the other:
 *
 * - The Records below are typed against the app's own types, so adding a
 *   forecast field, a Forecast page field or a setting fails the typecheck
 *   until it's mapped here.
 * - tests/mcp-parity.test.ts checks every app page is mapped to the tools that
 *   cover it, every tool named here exists, and every readable table is in the
 *   MCP's data dictionary.
 */

/** Every MCP tool, in the order the server registers them. */
export const TOOLS = [
  "data_dictionary",
  "describe_schema",
  "run_query",
  "explain_query",
  "sample_table",
  "get_balances",
  "get_pnl",
  "get_clients",
  "get_aged_debtors",
  "get_staff_pay",
  "get_take_home",
  "get_forecast",
  "get_corporation_tax",
  "get_set_asides",
  "get_settings",
  "sync_status",
  "get_analysis_pack",
  "get_forecast_pack",
] as const
export type ToolName = (typeof TOOLS)[number]

/** Hidden from the MCP on purpose: the reason is required. */
type Hidden = { hidden: string }

/**
 * Each page under src/app/(app), by route, and the tools that give the
 * analyst what it shows. A new page fails the parity test until it's here.
 */
export const PAGES: Record<string, readonly ToolName[] | Hidden> = {
  "/": { hidden: "Redirects to /forecast." },
  "/forecast": ["get_forecast", "get_balances", "get_forecast_pack"],
  "/pnl": ["get_pnl", "get_analysis_pack"],
  "/clients": ["get_clients", "get_aged_debtors"],
  "/staff": ["get_staff_pay", "get_take_home"],
  "/set-asides": ["get_set_asides"],
  "/corporation-tax": ["get_corporation_tax"],
  "/settings": ["sync_status"],
  "/settings/rules": ["get_settings"],
  "/settings/projects": ["run_query"],
  "/settings/people": ["run_query"],
  "/settings/accounts": ["get_settings", "run_query"],
  "/settings/password": { hidden: "A director's own password." },
  "/settings/claude": { hidden: "The MCP's own connections." },
}

/** Sections of get_forecast. "always" fields come back with every call. */
export const FORECAST_SECTIONS = [
  "months",
  "timeline",
  "invoices",
  "expected_money",
  "bills",
  "running_costs",
  "accuracy",
  "reserve_loan",
  "history",
  "warnings",
] as const
export type ForecastSection = (typeof FORECAST_SECTIONS)[number]

type ReadyForecast = Extract<ForecastResult, { blocked: false }>

/** Where every field of the forecast goes in get_forecast. */
export const FORECAST_FIELDS: Record<
  Exclude<keyof ReadyForecast, "blocked">,
  ForecastSection | "always"
> = {
  today: "always",
  buffer: "always",
  financialYearStart: "always",
  paymentsFrom: "always",
  trackingFrom: "always",
  directorCount: "always",
  salaryPerMonth: "always",
  taxReserveBalance: "always",
  reserveOwed: "always",
  contractors: "always",
  months: "months",
  timeline: "timeline",
  invoices: "invoices",
  expectedMoney: "expected_money",
  bills: "bills",
  runningCostAverage: "running_costs",
  runningCosts: "running_costs",
  reserveWithdrawals: "reserve_loan",
  cashHistory: "history",
  invoicePayments: "history",
  warnings: "warnings",
}

/** Where every field the Forecast page loads goes in the MCP. */
export const FORECAST_PAGE_FIELDS: Record<
  keyof ForecastPageData,
  ToolName | ForecastSection | Hidden
> = {
  result: "get_forecast",
  warnings: "warnings",
  accuracy: "accuracy",
  unlinkedPayments: "bills",
  xeroClosing: "get_balances",
  taxReserveBalance: "get_balances",
  reserveOwed: "get_balances",
  manualBalance: "get_balances",
  lastXeroSync: "get_balances",
  settings: "get_settings",
  ctPaidYears: "get_settings",
  people: "run_query",
  adjustments: "run_query",
  setup: { hidden: "Setup checklist for the page itself." },
  operatingAccountId: { hidden: "An internal ID; roles are in get_settings." },
}

/** Every app setting: shown by get_settings, or hidden with a reason. */
export const SETTINGS: Record<SettingKey, true | Hidden> = {
  financial_year_start: true,
  ct_set_aside_rate: true,
  hours_per_day: true,
  invoice_day_rounding: true,
  forecast_lookback_days: true,
  forecast_months: true,
  operating_buffer_gbp: true,
  forecast_start_date: true,
  director_monthly_salary_gbp: true,
  bank_account_roles: true,
  vat_liability_account_id: true,
  vat_registered_from: true,
  vat_rate: true,
  ct_associated_companies: true,
  ct_paid_years: true,
  solidtime_token_expires_at: { hidden: "Integration internals." },
}

export const isHidden = (v: unknown): v is Hidden =>
  typeof v === "object" && v !== null && "hidden" in v
