import { sql } from "drizzle-orm"

import { db } from "@/db"

// Public liveness check: reports only whether the database answers.
export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
