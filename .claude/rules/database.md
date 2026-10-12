---
paths:
  - "src/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
  - "scripts/seed.ts"
---

# Database rules

- Schema lives in `src/db/schema/*.ts`; change it, then `pnpm db:generate --name <what>`. Never hand-write or edit a generated migration that has been pushed.
- Migrations run on every production build against the live database while the old deploy still serves: add → backfill → remove in a later push. No renames or drops in one step.
- Drizzle is 1.0 rc: `drizzle({ client })` takes no `schema`; use `drizzle-orm/zod` for generated Zod schemas. Check `node_modules/drizzle-orm` types before using an API from memory.
- Money: `numeric(14,2)`, GBP. Raw Xero tables keep `raw jsonb` beside typed columns.
- Seed is idempotent (upsert / on conflict do nothing) and must never overwrite user-edited rows or passwords.
- Every constraint or trigger gets a Vitest integration test against Docker Postgres.
