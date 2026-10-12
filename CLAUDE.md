@AGENTS.md

# fat-controller

Tandem's internal finance dashboard: reads Tandem's Xero organisation (read-only), caches it in Postgres, and shows the two directors P&L, cash, tax set-asides and take-home. Spec: `docs/SPEC.md` (source of truth, including Decisions). Plan and status: `docs/PLAN.md` (start at **Where we are**).

## Stack

Next.js 16 (App Router, `src/`, `proxy.ts`, Cache Components off), React 19, TypeScript strict, pnpm. Postgres 17 in Docker locally, Neon in production, both through Drizzle 1.0 rc (pinned) and `pg`. Better Auth (email and password, sign-in only). Zod 4. Tailwind 4 and shadcn/ui (base-nova). Vitest. Deployed on Vercel `lhr1`; every push to `main` is a production deploy.

## Commands

```
pnpm db:up          # Docker Postgres on :54329
pnpm db:generate    # migration from schema changes
pnpm db:migrate     # apply migrations (unpooled URL)
pnpm db:seed        # idempotent: directors from env, default settings
pnpm dev
pnpm gates          # typecheck, lint, test, build → PASS or FAIL: <step>
```

## Layers

`src/db/schema` (tables) → `src/lib/*.ts` pure logic and Zod (unit-tested) → `src/lib/*-store.ts` server-only queries → Server Components and server actions in `src/app/(app)`. Dashboards read SQL views only (M2+).

## Hard rules

- The repo is **public**: no secrets, no Tandem financial data, client names or personal data in code, fixtures, seed or commit messages.
- Never point local work or tests at Neon. Never print or commit `.env*` contents (except `.env.example`).
- Every page and server action calls `requireDirector()`; the proxy is only optimistic.
- Xero access is read-only and never happens on page load: only the sync route calls Xero.
- Never edit a pushed migration; keep migrations backward-compatible with the deploy still serving.
- Read env through `src/env.ts`; build auth URLs from `baseUrl`, never `env.BETTER_AUTH_URL`.
- Money is `numeric(14,2)` GBP; never do money arithmetic in floats in components.
