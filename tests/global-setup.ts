import { execFileSync } from "node:child_process"

import { Client } from "pg"

import { setUpAnalystRole } from "../scripts/analyst-role"

// Integration tests run against a dedicated database in the local Docker Postgres.
// Never point this at Neon.
export const TEST_DB_URL =
  "postgres://fat:fat@localhost:54329/fat_controller_test"

export default async function setup() {
  const admin = new Client({
    connectionString: "postgres://fat:fat@localhost:54329/postgres",
  })
  await admin.connect()
  await admin.query("drop database if exists fat_controller_test with (force)")
  await admin.query("create database fat_controller_test")
  await admin.end()
  execFileSync("pnpm", ["-s", "drizzle-kit", "migrate"], {
    env: { ...process.env, DATABASE_URL_UNPOOLED: TEST_DB_URL },
    stdio: "pipe",
  })
  // The MCP analyst's read-only role, so its guard and access tests run on a
  // fresh checkout.
  await setUpAnalystRole(TEST_DB_URL)
}
