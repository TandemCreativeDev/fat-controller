import { Client } from "pg"

import { ANALYST_ROLE, analystRoleSql } from "../src/lib/mcp/access"

/**
 * Local only: create the read-only analyst role (throwaway password) and grant
 * it the allow list, on the dev database (or the one given). Never Neon.
 */
export async function setUpAnalystRole(url: string) {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url))
    throw new Error("analyst-role.ts only runs against local Postgres")
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const { rowCount } = await client.query(
      "select 1 from pg_roles where rolname = $1",
      [ANALYST_ROLE]
    )
    if (!rowCount)
      await client.query(
        `create role ${ANALYST_ROLE} login password '${ANALYST_ROLE}'`
      )
    await client.query(analystRoleSql())
  } finally {
    await client.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url =
    process.argv[2] ??
    process.env.DATABASE_URL ??
    "postgres://fat:fat@localhost:54329/fat_controller"
  await setUpAnalystRole(url)
  console.log("fc_analyst ready")
}
