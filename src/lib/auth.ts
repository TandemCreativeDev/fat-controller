import { mcp } from "@better-auth/mcp"
import { betterAuth } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { jwt } from "better-auth/plugins"

import { db } from "@/db"
import * as schema from "@/db/schema"
import { baseUrl, env, trustedOrigins } from "@/env"

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//

/**
 * MCP clients that sign in through a local callback (Claude Code, desktop apps)
 * are native apps, but don't always say so when they register, and the OAuth
 * default ("web") refuses http loopback redirects. Mark those as native.
 */
const nativeLoopbackClients = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/oauth2/register") return
  const body = ctx.body as
    { application_type?: string; redirect_uris?: unknown } | undefined
  const uris = body?.redirect_uris
  if (
    body &&
    body.application_type === undefined &&
    Array.isArray(uris) &&
    uris.length > 0 &&
    uris.every((u) => typeof u === "string" && LOOPBACK.test(u))
  )
    return { context: { body: { ...body, application_type: "native" } } }
})

/** The MCP server's resource identifier: access tokens are bound to it. */
export const mcpResource = `${baseUrl}/api/mcp`

export const auth = betterAuth({
  baseURL: baseUrl,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
      jwks: schema.jwks,
      oauthClient: schema.oauthClient,
      oauthResource: schema.oauthResource,
      oauthClientResource: schema.oauthClientResource,
      oauthRefreshToken: schema.oauthRefreshToken,
      oauthAccessToken: schema.oauthAccessToken,
      oauthConsent: schema.oauthConsent,
      oauthClientAssertion: schema.oauthClientAssertion,
    },
  }),
  // The jwt plugin's own /token would hand out session JWTs; only OAuth issues tokens.
  disabledPaths: ["/token"],
  hooks: { before: nativeLoopbackClients },
  // Director accounts are created by the seed; nobody signs up.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    // OAuth 2.1 for the MCP server (/api/mcp). Claude registers itself, then a
    // director signs in and approves. Tokens are JWTs bound to mcpResource.
    mcp({
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      resource: mcpResource,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // No overlap window: a reused refresh token is always refused.
      refreshTokenReuseInterval: 0,
    }),
    nextCookies(),
  ],
})
