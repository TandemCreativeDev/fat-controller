import { existsSync } from "node:fs"

import { defineConfig } from "drizzle-kit"

import { normaliseConnectionString } from "./src/db/connection"

// Locally the URLs come from .env.local; on Vercel they are injected by the Neon integration.
if (existsSync(".env.local")) process.loadEnvFile(".env.local")

// DDL goes over the direct connection, never through PgBouncer.
const url = process.env.DATABASE_URL_UNPOOLED
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set")

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: normaliseConnectionString(url) },
  strict: true,
})
