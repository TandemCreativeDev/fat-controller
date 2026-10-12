# fat-controller: Plan

## Where we are

**2026-10-12.** Local: sign-in, settings, Xero connect + daily-style sync, and the monthly P&L home screen all work on Tandem's real data. Production paused by request. Next: account-group mapping UI, then Clients and Tax & take-home.

**Open questions:** see the spec's _Open questions_; the dividend method parameters and how projects are tagged in Xero block M2/M3 detail, not M1.

## M0: Live on day one

- [x] Scaffold in `src/`, pnpm, TypeScript strict, shadcn/ui (base-nova)
- [x] `compose.yaml` (Postgres 17 on :54329), `.env.example`, `src/env.ts`
- [x] `src/db` pool (`max 5`, `attachDatabasePool` on Vercel, `sslmode=verify-full`), `drizzle.config.ts` on the unpooled URL
- [x] Better Auth schema + rate_limit + settings tables; first migration
- [x] Idempotent seed: directors from env, default settings
- [x] Sign-in (no sign-up), proxy redirect, `requireDirector()`, sign out
- [x] Settings page: CT rate, financial year start, change password
- [x] `/api/health`; gates script; Vitest for settings and director parsing
- [ ] GitHub repo `TandemCreativeDev/fat-controller` (public), push
- [ ] Vercel project in `lhr1`, git connected, `vercel.json` build = migrate → seed → build
- [ ] Neon (aws-eu-west-2) through the Marketplace; env vars set; secrets added
- [ ] First deploy verified; live URL handed over

## M1: Xero connect and sync

- [ ] Register the Starter app (a director, at developer.xero.com); `XERO_*`, `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` in Vercel
- [x] Token crypto (AES-GCM, pure + tested); `xero_connection` table
- [x] OAuth connect flow from settings (state cookie; confidential client so no PKCE), first tenant, encrypted tokens; retries without report scopes on `invalid_scope`
- [x] Xero client: token refresh in the same transaction as the write-back, `If-Modified-Since`, paging, 50/min throttle, Zod response schemas
- [x] Raw tables + `sync_run` + `sync_cursor`; integration tests (paging, cursor, resume, line replacement, lock)
- [x] `/api/cron/sync` (bearer `CRON_SECRET`), time-budgeted resumable passes, advisory lock
- [ ] Vercel cron entry in `vercel.json` (with the first production deploy)
- [x] Manual sync button (loops 45 s slices for the backfill; 5-minute cooldown after a complete pass); status, counts and errors on settings
- [ ] Failure email after two failures or a refresh-token error
- [x] Proven locally against Tandem's organisation (all scopes granted, including P&L reports)
- [x] Monthly P&L report snapshots (13 months, refreshed when older than 12 h)

## M2: Core dashboards

- [x] `account_group` table with tested default rules + warning for uncounted accounts
- [ ] Mapping UI to override an account's group
- [x] P&L engine: monthly report snapshots → grouped rows (pure, fixture-tested)
- [x] `v_pnl_monthly`; home screen table + sales vs people chart; as-of time
- [ ] Links from figures to the Xero records behind them
- [ ] Clients screen: `v_revenue_by_client_month`, days to pay, outstanding
- [ ] Take-home engine (needs the dividend method parameters) + Tax & take-home screen; checked against the last two manual calculations

## M3: Depth

- [ ] `project_map` and project view
- [ ] Cash screen (`v_cash_daily`, aged debtors and creditors)
- [ ] Costs screen with subscription run rate
- [ ] Deadlines settings + panel (30-day flag)
- [ ] VAT open-quarter estimate (`v_vat_open_quarter`), fixture-tested
- [ ] Nightly report snapshots

## Later (v2)

Webhooks, Solidtime hours per project, monthly PDF for the accountant.
