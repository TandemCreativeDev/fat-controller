import "server-only"

import { createMcpProtectedRequestHandler } from "@better-auth/mcp"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { and, count, eq, gte } from "drizzle-orm"

import { db } from "@/db"
import { mcpCall, oauthConsent, user } from "@/db/schema"
import { isDirector } from "@/lib/director"
import { mcpResource } from "@/lib/auth"
import { baseUrl } from "@/env"
import { createServer } from "./server"

const issuer = `${baseUrl}/api/auth`
export const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/api/mcp`

export const PER_MINUTE = 30
export const PER_DAY = 1000

function refuse(status: number, message: string): Response {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (status === 401)
    headers["www-authenticate"] =
      `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="${message}"`
  if (status === 429) headers["retry-after"] = "60"
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message },
      id: null,
    }),
    { status, headers }
  )
}

/** Calls this person made in the last minute and day, from the call log. */
async function overLimit(userId: string): Promise<boolean> {
  const since = (ms: number) => new Date(Date.now() - ms)
  const [[minute], [day]] = await Promise.all([
    db
      .select({ n: count() })
      .from(mcpCall)
      .where(
        and(eq(mcpCall.userId, userId), gte(mcpCall.createdAt, since(60_000)))
      ),
    db
      .select({ n: count() })
      .from(mcpCall)
      .where(
        and(
          eq(mcpCall.userId, userId),
          gte(mcpCall.createdAt, since(86_400_000))
        )
      ),
  ])
  return minute.n >= PER_MINUTE || day.n >= PER_DAY
}

/**
 * The remote MCP server: Streamable HTTP, stateless, JSON responses. The token
 * is a JWT bound to /api/mcp, checked against our JWKS; then the connection's
 * consent must still exist (so Revoke works at once, though the JWT lives an
 * hour), the user must be a director, and they must be under the rate limit.
 */
export const handleMcp = createMcpProtectedRequestHandler(
  {
    issuer,
    audience: mcpResource,
    jwksUrl: `${issuer}/jwks`,
    jwtVerifyOptions: { requiredClaims: ["sub"] },
  },
  async (request, claims) => {
    const userId = String(claims.sub)
    const clientId =
      typeof claims.azp === "string"
        ? claims.azp
        : typeof claims.client_id === "string"
          ? claims.client_id
          : null
    if (!clientId) return refuse(401, "This token isn't from a connected app.")

    const [consent] = await db
      .select({ id: oauthConsent.id })
      .from(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, userId),
          eq(oauthConsent.clientId, clientId)
        )
      )
    if (!consent)
      return refuse(
        401,
        "This connection was removed. Connect Fat Controller again."
      )
    if (!(await isDirector(userId)))
      return refuse(403, "Only directors can use Fat Controller.")

    const isCall =
      request.method === "POST" &&
      /"tools\/call"/.test(await request.clone().text())
    if (isCall && (await overLimit(userId)))
      return refuse(
        429,
        `Too many calls: the limit is ${PER_MINUTE} a minute and ${PER_DAY} a day.`
      )

    const [person] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId))
    const server = createServer({
      userId,
      name: person?.name ?? "Director",
      clientId,
    })
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      return await transport.handleRequest(request)
    } finally {
      void server.close()
    }
  }
)
