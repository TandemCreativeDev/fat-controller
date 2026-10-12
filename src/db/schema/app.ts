import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { user } from "./auth"

/**
 * App-owned settings as key → JSON value. Each key's shape is defined and
 * validated by the registry in `src/lib/settings.ts`; the database only stores it.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
})
