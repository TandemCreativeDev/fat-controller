import { timingSafeEqual } from "node:crypto"

import { env } from "@/env"
import { runSync } from "@/lib/xero/sync"

export const maxDuration = 300

// Called daily by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`).
export async function GET(request: Request) {
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET ?? ""}`)
  if (
    !env.CRON_SECRET ||
    given.length !== expected.length ||
    !timingSafeEqual(given, expected)
  ) {
    return Response.json({ error: "unauthorised" }, { status: 401 })
  }
  const result = await runSync("cron", 240_000)
  return Response.json(result, {
    status: result.status === "failed" ? 500 : 200,
  })
}
