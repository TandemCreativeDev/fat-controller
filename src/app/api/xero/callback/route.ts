import { timingSafeEqual } from "node:crypto"

import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

import { getDirector } from "@/lib/session"
import { exchangeCode, listTenants, saveConnection } from "@/lib/xero/tokens"

const settings = (request: NextRequest, params: Record<string, string>) =>
  NextResponse.redirect(
    new URL(`/settings?${new URLSearchParams(params)}`, request.url)
  )

export async function GET(request: NextRequest) {
  const director = await getDirector()
  if (!director) return NextResponse.redirect(new URL("/sign-in", request.url))

  const jar = await cookies()
  const expected = jar.get("xero_oauth_state")?.value
  const attempt = jar.get("xero_oauth_scopes")?.value
  jar.delete({ name: "xero_oauth_state", path: "/api/xero" })
  jar.delete({ name: "xero_oauth_scopes", path: "/api/xero" })

  const q = request.nextUrl.searchParams
  const state = q.get("state") ?? ""
  if (
    !expected ||
    state.length !== expected.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(expected))
  ) {
    return settings(request, { xero: "error", reason: "state" })
  }

  const error = q.get("error")
  if (error) {
    // Report scopes may be unavailable to this app tier: retry once without them.
    if (error === "invalid_scope" && attempt === "all") {
      return NextResponse.redirect(
        new URL("/api/xero/connect?scopes=core", request.url)
      )
    }
    return settings(request, { xero: "error", reason: error.slice(0, 64) })
  }

  const code = q.get("code")
  if (!code) return settings(request, { xero: "error", reason: "no-code" })

  try {
    const tokens = await exchangeCode(code)
    const tenants = await listTenants(tokens.access_token)
    if (tenants.length === 0)
      return settings(request, { xero: "error", reason: "no-organisation" })
    // One organisation per app (spec). If several were authorised, the first is used and named on the settings page.
    const tenant = tenants[0]
    await saveConnection({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName ?? "Xero organisation",
      tokens,
      userId: director.id,
    })
    return settings(request, { xero: "connected" })
  } catch (err) {
    console.error(
      "xero callback failed:",
      err instanceof Error ? err.message : err
    )
    return settings(request, { xero: "error", reason: "exchange" })
  }
}
