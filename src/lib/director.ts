import "server-only"

import { eq } from "drizzle-orm"

import { db } from "@/db"
import { user } from "@/db/schema"

/**
 * Is this user a director? Sign-up is disabled and the seed creates only the
 * directors, so every account is one. Kept as one check so the session and the
 * MCP token paths can't drift apart.
 */
export async function isDirector(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
  return Boolean(row)
}
