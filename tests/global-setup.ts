import { execFileSync } from "node:child_process"

import { Client } from "pg"

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
}
