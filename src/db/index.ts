import { attachDatabasePool } from "@vercel/functions"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { env } from "@/env"
import { normaliseConnectionString } from "./connection"

// One pool per function instance. Small, with a short idle timeout, because
// Fluid compute keeps instances warm and Neon's pooler sits in front anyway.
const pool = new Pool({
  connectionString: normaliseConnectionString(env.DATABASE_URL),
  max: 5,
  idleTimeoutMillis: 5_000,
})

if (env.VERCEL) attachDatabasePool(pool)

export const db = drizzle({ client: pool })
export { pool }
export type Db = typeof db
