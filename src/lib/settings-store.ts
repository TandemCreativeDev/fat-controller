import "server-only"

import { db } from "@/db"
import { settings } from "@/db/schema"
import {
  resolveSettings,
  settingDefinitions,
  type SettingKey,
  type SettingValue,
  type Settings,
} from "@/lib/settings"

export async function getSettings(): Promise<Settings> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
  return resolveSettings(rows)
}

export async function saveSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
  userId: string
) {
  const parsed = settingDefinitions[key].schema.parse(value)
  await db
    .insert(settings)
    .values({ key, value: parsed, updatedBy: userId })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: parsed, updatedBy: userId, updatedAt: new Date() },
    })
}
