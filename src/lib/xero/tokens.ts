import "server-only"

import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { xeroConnection } from "@/db/schema"
import { decrypt, encrypt } from "@/lib/crypto"
import {
  requireXeroConfig,
  XERO_CONNECTIONS_URL,
  XERO_TOKEN_URL,
  xeroRedirectUri,
  type XeroConfig,
} from "./config"

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.string().optional(),
})
export type TokenResponse = z.infer<typeof tokenResponse>

const connectionsResponse = z.array(
  z.looseObject({
    tenantId: z.string(),
    tenantName: z.string().nullish(),
    tenantType: z.string(),
  })
)

export class XeroAuthError extends Error {}

async function tokenRequest(
  config: XeroConfig,
  body: Record<string, string>
): Promise<TokenResponse> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  })
  if (!res.ok) {
    // Xero returns { error: "invalid_grant" } etc.; never log the request body.
    const err = await res.json().catch(() => ({}))
    throw new XeroAuthError(
      `Xero token request failed: ${res.status} ${err?.error ?? ""}`.trim()
    )
  }
  return tokenResponse.parse(await res.json())
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest(requireXeroConfig(), {
    grant_type: "authorization_code",
    code,
    redirect_uri: xeroRedirectUri(),
  })
}

export async function listTenants(accessToken: string) {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Xero connections request failed: ${res.status}`)
  return connectionsResponse
    .parse(await res.json())
    .filter((t) => t.tenantType === "ORGANISATION")
}

export async function saveConnection(input: {
  tenantId: string
  tenantName: string
  tokens: TokenResponse
  userId: string
}) {
  const { key } = requireXeroConfig()
  const values = {
    id: "xero",
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    refreshTokenEnc: encrypt(input.tokens.refresh_token, key),
    accessTokenEnc: encrypt(input.tokens.access_token, key),
    accessTokenExpiresAt: new Date(Date.now() + input.tokens.expires_in * 1000),
    scopes: input.tokens.scope ?? "",
    connectedBy: input.userId,
    connectedAt: new Date(),
    lastRefreshedAt: new Date(),
    status: "active" as const,
    lastError: null,
  }
  await db
    .insert(xeroConnection)
    .values(values)
    .onConflictDoUpdate({ target: xeroConnection.id, set: values })
}

/**
 * A valid access token plus the tenant id. Refreshes when the token has under two
 * minutes left. The row is locked for the refresh, and the rotated refresh token
 * is written in the same transaction, because each refresh token works only once.
 */
export async function getAccessToken(): Promise<{
  accessToken: string
  tenantId: string
}> {
  const config = requireXeroConfig()
  return db.transaction(async (tx) => {
    const [conn] = await tx
      .select()
      .from(xeroConnection)
      .where(eq(xeroConnection.id, "xero"))
      .for("update")
    if (!conn) throw new XeroAuthError("Xero is not connected")

    const fresh =
      conn.accessTokenEnc &&
      conn.accessTokenExpiresAt &&
      conn.accessTokenExpiresAt.getTime() - Date.now() > 120_000
    if (fresh)
      return {
        accessToken: decrypt(conn.accessTokenEnc!, config.key),
        tenantId: conn.tenantId,
      }

    let tokens: TokenResponse
    try {
      tokens = await tokenRequest(config, {
        grant_type: "refresh_token",
        refresh_token: decrypt(conn.refreshTokenEnc, config.key),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Record the failure outside this transaction so the rollback doesn't erase it.
      void db
        .update(xeroConnection)
        .set({ status: "error", lastError: message })
        .where(eq(xeroConnection.id, "xero"))
        .catch(() => {})
      throw err
    }

    await tx
      .update(xeroConnection)
      .set({
        refreshTokenEnc: encrypt(tokens.refresh_token, config.key),
        accessTokenEnc: encrypt(tokens.access_token, config.key),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        lastRefreshedAt: sql`now()`,
        status: "active",
        lastError: null,
      })
      .where(eq(xeroConnection.id, "xero"))
    return { accessToken: tokens.access_token, tenantId: conn.tenantId }
  })
}
