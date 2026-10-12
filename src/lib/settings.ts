import { z } from "zod"

/**
 * Every app setting, its schema and its default. The `settings` table stores
 * values as JSON; this registry is the only place their shapes are defined.
 * Dividend method parameters and deadline dates are added here when M3/M4 need them.
 */
export const settingDefinitions = {
  ct_set_aside_rate: {
    label: "Corporation Tax set-aside rate",
    description:
      "Share of sales set aside for Corporation Tax before distribution.",
    schema: z.number().min(0).max(1),
    default: 0.2,
  },
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
