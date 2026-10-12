import { randomBytes } from "node:crypto"

import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

import { getDirector } from "@/lib/session"
import {
  CORE_SCOPES,
  REPORT_SCOPES,
  XERO_AUTHORIZE_URL,
  xeroConfig,
  xeroRedirectUri,
} from "@/lib/xero/config"

// Starts the OAuth authorisation-code flow. `?scopes=core` retries without report scopes.
export async function GET(request: NextRequest) {
  if (!(await getDirector()))
    return NextResponse.redirect(new URL("/sign-in", request.url))
  const config = xeroConfig()
  if (!config)
    return NextResponse.redirect(
      new URL("/settings?xero=not-configured", request.url)
    )

  const coreOnly = request.nextUrl.searchParams.get("scopes") === "core"
  const state = randomBytes(24).toString("base64url")
  const jar = await cookies()
  const cookie = {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/api/xero",
    maxAge: 600,
  }
  jar.set("xero_oauth_state", state, cookie)
  jar.set("xero_oauth_scopes", coreOnly ? "core" : "all", cookie)

  const url = new URL(XERO_AUTHORIZE_URL)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", xeroRedirectUri())
  url.searchParams.set(
    "scope",
    (coreOnly ? CORE_SCOPES : [...CORE_SCOPES, ...REPORT_SCOPES]).join(" ")
  )
  url.searchParams.set("state", state)
  return NextResponse.redirect(url)
}
