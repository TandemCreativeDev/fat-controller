import "server-only"

import { XERO_API_URL } from "./config"
import { toIfModifiedSince } from "./dates"
import { getAccessToken } from "./tokens"

/** Xero allows 60 calls a minute per organisation; we stop at 50 to leave headroom. */
const PER_MINUTE = 50
const recentCalls: number[] = []

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function throttle() {
  const now = Date.now()
  while (recentCalls.length && now - recentCalls[0] > 60_000)
    recentCalls.shift()
  if (recentCalls.length >= PER_MINUTE) {
    await sleep(60_000 - (now - recentCalls[0]) + 250)
    return throttle()
  }
  recentCalls.push(Date.now())
}

/** Tests only: clear the call history so each case starts with a full minute's allowance. */
export function resetThrottle() {
  recentCalls.length = 0
}

export class XeroApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export type XeroGetOptions = {
  params?: Record<string, string | number | boolean | undefined>
  modifiedSince?: Date | null
}

/**
 * GET one Accounting API resource. Counts each HTTP call via `onCall` so a sync
 * run can record its API usage against the daily limit.
 */
export async function xeroGet(
  path: string,
  opts: XeroGetOptions,
  onCall: () => void
): Promise<unknown> {
  const { accessToken, tenantId } = await getAccessToken()
  const url = new URL(`${XERO_API_URL}/${path}`)
  for (const [k, v] of Object.entries(opts.params ?? {}))
    if (v !== undefined) url.searchParams.set(k, String(v))

  for (let attempt = 0; ; attempt++) {
    await throttle()
    onCall()
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "xero-tenant-id": tenantId,
        Accept: "application/json",
        ...(opts.modifiedSince
          ? { "If-Modified-Since": toIfModifiedSince(opts.modifiedSince) }
          : {}),
      },
      cache: "no-store",
    })
    if (res.status === 304) return null
    if (res.status === 429 && attempt === 0) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "60")
      if (
        res.headers.get("X-Rate-Limit-Problem")?.toLowerCase() === "day" ||
        retryAfter > 120
      ) {
        throw new XeroApiError("Xero daily API limit reached", 429)
      }
      await sleep(retryAfter * 1000)
      continue
    }
    if (!res.ok)
      throw new XeroApiError(
        `Xero GET ${path} failed: ${res.status}`,
        res.status
      )
    return res.json()
  }
}
