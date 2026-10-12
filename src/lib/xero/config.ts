import { baseUrl, env } from "@/env"
import { parseKey } from "@/lib/crypto"

export const XERO_AUTHORIZE_URL =
  "https://login.xero.com/identity/connect/authorize"
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token"
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections"
export const XERO_API_URL = "https://api.xero.com/api.xro/2.0"

/** Read-only granular scopes (required for apps created after 2 March 2026). */
export const CORE_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.invoices.read",
  "accounting.payments.read",
  "accounting.banktransactions.read",
  "accounting.manualjournals.read",
  "accounting.contacts.read",
  "accounting.settings.read",
]

/**
 * Report scopes. Some sources say P&L and Balance Sheet need Xero's App Partner
 * Program; if Xero rejects them, the connect flow retries with CORE_SCOPES only.
 */
export const REPORT_SCOPES = [
  "accounting.reports.profitandloss.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.banksummary.read",
  "accounting.reports.aged.read",
]

export function xeroRedirectUri(): string {
  return `${baseUrl}/api/xero/callback`
}

export type XeroConfig = { clientId: string; clientSecret: string; key: Buffer }

/** Null when Xero isn't configured in this environment. */
export function xeroConfig(): XeroConfig | null {
  if (
    !env.XERO_CLIENT_ID ||
    !env.XERO_CLIENT_SECRET ||
    !env.TOKEN_ENCRYPTION_KEY
  )
    return null
  return {
    clientId: env.XERO_CLIENT_ID,
    clientSecret: env.XERO_CLIENT_SECRET,
    key: parseKey(env.TOKEN_ENCRYPTION_KEY),
  }
}

export function requireXeroConfig(): XeroConfig {
  const config = xeroConfig()
  if (!config)
    throw new Error(
      "Xero is not configured (XERO_CLIENT_ID, XERO_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY)"
    )
  return config
}
