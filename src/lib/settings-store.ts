import "server-only"

import { eq } from "drizzle-orm"

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
  // The column is NOT NULL, so "no value" is stored as no row.
  if (parsed === null) {
    await db.delete(settings).where(eq(settings.key, key))
    return
  }
  await db
    .insert(settings)
    .values({ key, value: parsed, updatedBy: userId })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: parsed, updatedBy: userId, updatedAt: new Date() },
    })
}

/** A value the app maintains itself, such as one read during a sync. */
export async function saveSystemSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>
) {
  const parsed = settingDefinitions[key].schema.parse(value)
  if (parsed === null) {
    await db.delete(settings).where(eq(settings.key, key))
    return
  }
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: parsed, updatedAt: new Date() },
    })
}
