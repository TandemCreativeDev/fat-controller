import { randomBytes } from "node:crypto"

// Applied before any test module imports src/env.ts.
process.env.DATABASE_URL =
  "postgres://fat:fat@localhost:54329/fat_controller_test"
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("base64")
process.env.XERO_CLIENT_ID = "test-client"
process.env.XERO_CLIENT_SECRET = "test-secret"
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64")
process.env.CRON_SECRET = "test-cron-secret-123456"
