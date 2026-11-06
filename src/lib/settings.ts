import { z } from "zod"

/**
 * Every app setting, its schema and its default. The `settings` table stores
 * values as JSON; this registry is the only place their shapes are defined.
 */
export const settingDefinitions = {
  financial_year_start: {
    label: "Financial year start",
    description: "Day and month the company's financial year begins.",
    schema: z
      .object({ month: z.int().min(1).max(12), day: z.int().min(1).max(31) })
      .refine(
        ({ month, day }) =>
          day <= new Date(Date.UTC(2000, month, 0)).getUTCDate(),
        {
          message: "That day doesn't exist in that month",
        }
      ),
    default: { month: 4, day: 1 },
  },
  ct_set_aside_rate: {
    label: "Corporation Tax set-aside rate",
    description: "Share of each invoice's margin moved to the tax reserve.",
    schema: z.number().min(0).max(1),
    default: 0.2,
  },
  hours_per_day: {
    label: "Hours per day",
    description: "Tracked hours that make one billable day.",
    schema: z.number().positive().max(24),
    default: 7.5,
  },
  invoice_day_rounding: {
    label: "Invoice day rounding",
    description: "Each invoice's days round to the nearest multiple of this.",
    schema: z.number().positive().max(1),
    default: 0.25,
  },
  forecast_lookback_days: {
    label: "Forecast lookback (days)",
    description: "Calendar days of tracked time behind each daily rate.",
    schema: z.int().min(1).max(365),
    default: 42,
  },
  forecast_months: {
    label: "Forecast months",
    description: "Months shown, including the current one.",
    schema: z.int().min(1).max(12),
    default: 3,
  },
  operating_buffer_gbp: {
    label: "Operating buffer (£)",
    description: "Amount left in the main account each month.",
    schema: z.number().min(0),
    default: 100,
  },
  forecast_start_date: {
    label: "Forecast start date",
    description:
      "When Solidtime tracking began; nothing earlier is forecast or linked.",
    schema: z.iso.date().nullable(),
    default: null,
  },
  bank_account_roles: {
    label: "Bank account roles",
    description: "Operating or tax reserve, per Xero bank account.",
    schema: z.record(z.string(), z.enum(["operating", "tax_reserve"])),
    default: {},
  },
  vat_liability_account_id: {
    label: "VAT liability account",
    description: "Xero account that VAT payments to HMRC are coded to.",
    schema: z.string().nullable(),
    default: null,
  },
  vat_registered_from: {
    label: "VAT registered from",
    description: "Empty until the company registers.",
    schema: z.iso.date().nullable(),
    default: null,
  },
  vat_rate: {
    label: "VAT rate",
    description: "Charged on top of forecast invoices once registered.",
    schema: z.number().min(0).max(1),
    default: 0.2,
  },
  solidtime_token_expires_at: {
    label: "Solidtime token expiry",
    description: "Read from Solidtime's token list on each sync.",
    schema: z.string().nullable(),
    default: null,
  },
} as const

export type SettingKey = keyof typeof settingDefinitions
export type SettingValue<K extends SettingKey> = z.output<
  (typeof settingDefinitions)[K]["schema"]
>
export type Settings = { [K in SettingKey]: SettingValue<K> }

export const settingKeys = Object.keys(settingDefinitions) as SettingKey[]

/**
 * Merge stored rows over the defaults. A stored value that no longer matches its
 * schema falls back to the default rather than breaking every page.
 */
export function resolveSettings(
  rows: { key: string; value: unknown }[]
): Settings {
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  const out = {} as Record<SettingKey, unknown>
  for (const key of settingKeys) {
    const def = settingDefinitions[key]
    const parsed = def.schema.safeParse(stored.get(key))
    out[key] = parsed.success ? parsed.data : def.default
  }
  return out as Settings
}
