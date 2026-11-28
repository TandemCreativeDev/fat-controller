"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { FormState } from "@/components/action-form"
import { db } from "@/db"
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from "@/db/schema"
import { requireDirector } from "@/lib/session"

/**
 * Disconnect an app: its consent goes (so the MCP route refuses its access
 * token on the next call) along with every refresh and stored access token.
 */
export async function revokeConnection(
  _prev: FormState,
  data: FormData
): Promise<FormState> {
  const director = await requireDirector()
  const clientId = z.string().min(1).parse(data.get("clientId"))
  const mine = (
    t: typeof oauthConsent | typeof oauthRefreshToken | typeof oauthAccessToken
  ) => and(eq(t.clientId, clientId), eq(t.userId, director.id))
  await db.transaction(async (tx) => {
    await tx.delete(oauthConsent).where(mine(oauthConsent))
    await tx.delete(oauthAccessToken).where(mine(oauthAccessToken))
    await tx.delete(oauthRefreshToken).where(mine(oauthRefreshToken))
  })
  revalidatePath("/settings/claude")
  return { ok: true, message: "Disconnected." }
}
