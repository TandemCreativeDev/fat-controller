# Fat Controller MCP: a financial analyst for Claude

## Status (28 Nov 2026)

Built and shipped. Where the build differed from the plan below:
- **Auth:** uses `@better-auth/mcp` 1.7.7. Its `mcp()` wraps `@better-auth/oauth-provider`, binds tokens to `/api/mcp` and serves the protected-resource metadata. The route verifies tokens with `createMcpProtectedRequestHandler`, using issuer `${baseUrl}/api/auth`.
- **Revoke:** access tokens are JWTs, which aren't stored. So the route checks the `oauth_consent` row for `(sub, azp)` on every call, and Disconnect deletes the consent, refresh tokens and any stored access tokens.
- **Native clients:** a Better Auth `before` hook marks registrations whose redirect URIs are all http loopback as `application_type: "native"`. Claude Code doesn't say so itself, and the default ("web") refuses http loopback redirects.
- **Multiple statements:** an empty `values` array does **not** force the extended protocol in `pg` 8.23; only non-empty values do. `runReadOnly` sets `queryMode: "extended"` instead, which a test covers.
- **Settings:** the connect guide and the connection list (with Disconnect) live under Settings → Claude.
- **Production:** the role was created on Neon and `scripts/analyst-role.sql` applied. `ANALYST_DATABASE_URL` is set in Vercel production.

## Goal

Let Claude (claude.ai, the desktop app, mobile, Claude Code) act as a full financial analyst over Tandem's books. It can:

- explore the data freely with SQL it writes itself
- use the app's own calculated figures (take-home, set-asides, CT, the reserve loan, the forecast) so its answers match what the dashboard says

It is **read-only end to end**. It never calls Xero, never writes to the database, and only the two directors can connect.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | The MCP server is a route in this app, `/api/mcp`, deployed to Vercel with everything else. | Same as Flume. One deploy, and it reuses the app's code, types and auth. |
| 2 | Remote Streamable HTTP, stateless: one MCP server per request, JSON responses, no SSE, no sessions. | Same as Flume (`WebStandardStreamableHTTPServerTransport`, `sessionIdGenerator: undefined`, `enableJsonResponse: true`). Suits Vercel functions. |
| 3 | Sign-in is OAuth 2.1 through Better Auth's `@better-auth/oauth-provider` (with the `jwt` plugin), with dynamic client registration and PKCE. | Claude registers itself and the director signs in with their Fat Controller account. Nothing to copy or paste. |
| 4 | Free SQL goes through a separate **read-only Postgres role**, `fc_analyst`, on its own connection string. It can read only the tables on an **allow list**, granted one by one. | Postgres itself guarantees read-only, whatever SQL the model writes. With an allow list, a forgotten table fails closed: the analyst can't read it. The app's main connection never runs model-written SQL. |
| 5 | Calculated-figure tools call the existing `src/lib/*-store.ts` functions. | One source of truth: the MCP and the dashboard can't disagree. These functions only read. |
| 6 | No Xero calls, ever. Freshness comes from the existing sync (daily cron plus the Sync button). | Xero rotates refresh tokens, so a second consumer would break the app's connection. This also keeps the hard rule that only the sync route calls Xero. |
| 7 | Every tool call is logged to a new `mcp_call` table: who, which tool, the SQL or arguments, duration, rows and errors. | So we can see what was asked and spot runaway use. |
| 8 | The analyst can see individual pay: `person`, `pay_rate`, `contractor_bill`, `v_staff_pay_monthly`. | A conscious choice. Both directors already see it in the dashboard, and staff costs are central to the analysis. It means pay data goes into Claude's context. |

## Architecture

```
Claude ──HTTPS + Bearer token──► /api/mcp  (src/app/api/mcp/route.ts)
                                   │
                                   ├─ verify token (oauth-provider) → director? else 401/403
                                   ├─ rate limit per director
                                   ├─ build McpServer, register tools
                                   │
                                   ├─ SQL tools ──────► analystPool (ANALYST_DATABASE_URL, fc_analyst, read-only)
                                   └─ figure tools ───► src/lib/*-store.ts ──► db (app pool, SELECTs only)
                                   │
                                   └─ log to mcp_call
```

New code:

```
src/lib/mcp/
  server.ts        createServer(director) → McpServer with every tool registered
  sql.ts           runReadOnly(sql, params) on the analyst pool: timeout, row cap, size cap
  schema-notes.ts  what each table, view and column means (no Tandem data: names and meanings only)
  tools/
    sql-tools.ts       describe_schema, run_query, explain_query, sample_table
    figure-tools.ts    pnl, clients, staff, forecast (one tool, with sections), CT, set-asides…
    pack-tools.ts      the Markdown analysis and forecast packs
    meta-tools.ts      sync_status, settings, data_dictionary
  prompts.ts       ready-made analyses (see Prompts)
  log.ts           mcp_call writes
src/app/api/mcp/route.ts                             GET/POST/DELETE → handler
src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts
src/app/.well-known/oauth-authorization-server/[[...path]]/route.ts
src/app/.well-known/openid-configuration/route.ts   (if the plugin needs it)
src/app/oauth/consent/page.tsx                       "Allow Claude to read Fat Controller?"
src/app/sign-in/                                     resumes the OAuth flow after signing in (see Auth)
src/lib/director.ts                                  isDirector(userId): shared by requireDirector() and the MCP
src/app/(app)/settings/connections/                  list and revoke connected apps
```

## Auth in detail

- **Install:** `@better-auth/oauth-provider@1.7.7` pinned to the installed `better-auth` 1.7.7 (its peer range is `^1.7.7`), plus the `jwt` plugin from `better-auth/plugins`. Before writing code, read the installed package's README and types: the API has changed between versions, so nothing here should come from memory.
- **Plugin config:**
  - `loginPage: "/sign-in"` and `consentPage: "/oauth/consent"`
  - dynamic client registration on, for public clients with PKCE
  - scopes limited to `openid profile offline_access` plus a custom `fc:read`
  - the audience/resource is `${baseUrl}/api/mcp`
- **Migrations:** run `pnpm db:generate` for the plugin's tables (OAuth clients, access and refresh tokens, consents, JWKS). These tables are additive, so they're backward-compatible with the deploy still serving.
- **Signing in must resume the flow.** The plugin sends the director to `loginPage` with a signed authorize query and expects them back. Today the director would land on the forecast and Claude's connection would never finish, for two reasons:
  - **After signing in:** the form calls `authClient.signIn.email` (`sign-in-form.tsx:23`). Once `oauthProviderClient()` is added to `src/lib/auth-client.ts`, the plugin attaches the authorize query to that request, and the response carries the redirect back to authorize. But `sign-in-form.tsx:36` ignores it and always does `router.replace("/")`.
    - **Fix:** follow the redirect in the response when there is one, and fall back to `/` otherwise.
    - Don't build a separate `callbackURL` scheme alongside the plugin's.
  - **Already signed in:** `sign-in/page.tsx:14` sends a signed-in director straight to `/`.
    - **Fix:** if the authorize query is present, send them on to the plugin's authorize step instead.
  - **Either way:** only follow same-origin relative paths starting with a single `/`, so it can't become an open redirect, and unit-test that check.
- **One director check for both.** `requireDirector()` reads the session cookie through `getDirector()`. Move the "is this user a director?" logic into `isDirector(userId)` in `src/lib/director.ts`. `getDirector()` and the MCP's token check both call it, so they can't drift apart.
- **Route guard:**
  1. Read `Authorization: Bearer …` and verify it with the plugin (signature, expiry, audience, `fc:read` scope).
  2. Confirm the user is a director with `isDirector(userId)`. Sign-up is disabled, so every user is a director, but check explicitly anyway. This is the MCP's equivalent of `requireDirector()`.
  3. **Check a row that proves the connection is still allowed,** so a revoke works immediately rather than when the token expires.
     - **Caveat:** Claude sends `resource` (the MCP spec requires it), and with a `resource` the plugin issues a **JWT** access token. A JWT probably has no access-token row to check.
     - **Preferred fix:** check the consent for `(user_id, client_id)` from the token's claims on every call. Revoke deletes the consent and the refresh tokens.
     - **Alternative:** configure the plugin to issue opaque, stored tokens for this resource, if it supports that.
     - **Settle this in build step 1** once the plugin is installed, and fit the revoke test to the choice.
  4. On failure, return `401` with `WWW-Authenticate: Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/api/mcp"` so Claude can discover the sign-in.
- **Proxy:** `/api` is already excluded from `proxy.ts`. Exclude `/.well-known` too, because without a cookie it would redirect to `/sign-in`. `/oauth/consent` can stay behind the proxy: it needs the session cookie anyway, and the sign-in resume brings the director back to it. It still calls `requireDirector()` itself.
- **URLs:** build everything from `baseUrl`, never `env.BETTER_AUTH_URL` (hard rule).
- **Revoking:** Settings → Connections lists each director's connected clients and their last use. Revoke deletes that client's consent and refresh tokens, plus any stored access tokens. Because the route checks the consent (or token) row on every call, it takes effect immediately.
- **Per-call cost:** three small queries before a tool runs (connection check, director check, rate-limit count). That's fine at this scale. They can become one query if latency ever matters.

## The read-only database role

### Deny by default

`fc_analyst` gets SELECT on an **allow list** of tables and views, granted one by one. It never gets `ON ALL TABLES` and has no default privileges. So:

- **A new table is unreadable until it's deliberately added,** so a forgotten sensitive table fails closed.
- **There's no gap at deploy time.** Migrations create the oauth-provider tables and `mcp_call` during the build, and with no default privileges the analyst can't read them, even for a moment.
- **It doesn't matter which role runs the migrations or the grants.** `ALTER DEFAULT PRIVILEGES` only applies to tables created by the role that ran it, which was a trap. On Neon that would have had to be the owner role from `DATABASE_URL_UNPOOLED`.

### Never on the allow list

These are listed in the code, so the test below can check each one:

- **Logins:** `user`, `session`, `account`, `verification`, `rate_limit`
- **OAuth:** the oauth-provider tables (clients, access tokens, refresh tokens, consents) by their generated names, and `jwks`, which holds the JWT signing private keys and is the most sensitive table in the database
- **Xero:** `xero_connection`, which holds the encrypted Xero token
- **Internals:** `sync_lock`
- **The log:** `mcp_call`, so the analyst can't read its own log
- **`settings`:** it holds no secrets today (the Solidtime token is in env), but someone could store one there later. `get_settings` exposes the safe keys instead.

### Setup

- **Every exposure decision lives in `src/lib/mcp/access.ts`:** the allowed tables and views, the denied tables in groups (logins, OAuth, Xero, internals, the log), and the `settings` keys `get_settings` may return.
- **Views run with their owner's rights** (`security_invoker` is off), so a view can read tables the analyst can't. That's intended: `v_current_fy` and the P&L view read `settings`, and denying `settings` doesn't break them. The risk is a future view over a sensitive table quietly exposing it. The access test (see Testing) checks every allowed view's dependencies.
- **`scripts/analyst-role.sql`** (no password) is checked in, generated from `access.ts` by `pnpm db:analyst:sql`. A test fails if it no longer matches `access.ts`, and the checked-in file is what gets pasted into the Neon editor. It does the setup:
  1. Sets the role's options: `default_transaction_read_only = on`, `statement_timeout = '15s'`, `idle_in_transaction_session_timeout = '15s'`.
  2. Grants `USAGE` on the schema.
  3. Grants `SELECT` on each allowed table and view.
  4. Revokes `SELECT` on everything on the deny list, as a safety net.

  It's idempotent, so it can be run again any time.
- **Production:** a director runs `CREATE ROLE fc_analyst LOGIN PASSWORD '<generated>'` once in the Neon SQL editor, then runs `scripts/analyst-role.sql`.
- **Locally:** `pnpm db:analyst` creates the role with a local-only password (`fc_analyst` / `fc_analyst`, throwaway like `compose.yaml`'s) and runs the same script against the Docker dev database.
- **Tests:** `tests/global-setup.ts` already recreates `fat_controller_test` and migrates it. It also creates `fc_analyst` if it's missing and runs `scripts/analyst-role.sql` after migrating. So `pnpm gates` works on a fresh checkout with no manual step.
- **Adding a table later:**
  1. Add it to `access.ts`, as allowed or denied, and regenerate `scripts/analyst-role.sql`.
  2. If allowed, **add the grant to the generated `migration.sql` by hand before pushing.** Drizzle only generates the `CREATE TABLE`. Use `GRANT SELECT … TO fc_analyst` inside `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fc_analyst') THEN … END IF; END $$`, so it works on databases without the role. The schema test catches a table missing from `access.ts`, but not a missing grant in production.
  3. **Backstop:** the role script is idempotent, so rerunning it in Neon after a deploy that adds a table fixes any grant that was forgotten.
- **Env:** `ANALYST_DATABASE_URL` in `src/env.ts`, required in production and optional locally, where it falls back to the local role. Vercel gets the pooled Neon URL for `fc_analyst`. Never point local work at Neon.

### Query guard (`sql.ts`)

Belt and braces on top of the role:

- Each call runs in `BEGIN READ ONLY` with `SET LOCAL statement_timeout = '15s'`, then `ROLLBACK`.
- **Every query passes a `values` array, even an empty one.** `pg` only uses the extended protocol, which rejects multiple statements, when values are passed. Without them it falls back to the simple protocol, which accepts `select 1; drop …`. A test covers this.
- **Row cap:** 100 rows by default, up to 1,000 on request. The response says `truncated: true`. The `run_query` description tells the model to aggregate in SQL rather than pull raw rows, because large results eat the conversation over many turns.
- **Size cap:** about 50 KB of JSON per response. Above that, the tool asks the model to aggregate.
- **Caps on the other tools:** figure tools are small and fixed-shape, so they have no row cap. They do have the same 50 KB cap, returning "too big, narrow the period" rather than truncating silently.
  - **Packs:** `get_analysis_pack` and `get_forecast_pack` get a higher cap, about 150 KB, because a whole picture is their point. They take a period, and a full year may need splitting.
  - **Measure first:** check the size of a real full-year pack locally in step 5 before fixing these numbers.
- **Errors:** Postgres error text goes back to the model, but never connection details (host, user, connection string).
- Numerics come back as strings (never floats), dates as ISO strings and JSONB as objects.
- **Pool:** the analyst pool is `max: 3` with a short idle timeout, using the same `attachDatabasePool` pattern as `src/db/index.ts`.

## Tools

The store functions named below all exist (checked). The library specifics in this plan are the Flume pattern, still to confirm against the installed packages: `WebStandardStreamableHTTPServerTransport`, SDK 1.32.2, and the `.well-known/[[...path]]` route layout. Neither `@modelcontextprotocol/sdk` nor `@better-auth/oauth-provider` is installed yet.

The aim is a fully fledged analyst. Every tool is read-only. Each one has a clear description written for the model: what it returns, its units (GBP, `numeric(14,2)` as strings), and when to prefer it over SQL.

### Explore with SQL

| Tool | What it does |
|---|---|
| `describe_schema` | Tables and views with columns, types and the meaning notes from `schema-notes.ts`. Takes an optional filter. |
| `data_dictionary` | The domain glossary: what a set-aside, the reserve loan, hold-back, buffer, `backstop_in`, the financial year and the "20% rule" each mean, and which bank account plays which role (by account ID and name, read live). |
| `run_query` | Any read-only SQL, with parameters, a row cap and a timeout. This is the main tool. |
| `explain_query` | `EXPLAIN` for a query, to check a big query is cheap before running it. It goes through the same guard (values array, read-only transaction, timeout). It refuses `ANALYZE` anywhere in the options, because `EXPLAIN ANALYZE` actually runs the query, and a read-only role would still let a heavy one run. |
| `sample_table` | The first N rows of a table or view, to see real shapes quickly. |

### The app's own figures (same numbers as the dashboard)

| Tool | Source | Returns |
|---|---|---|
| `get_balances` | forecast store | Current account, tax reserve, borrowed from the reserve, last sync date |
| `get_pnl` | `getPnlMonthly`, `getCostsByAccount` | Monthly sales, people costs, other costs, profit, margin and CT set-aside, plus costs by account for a period |
| `get_clients` | `getClientTable`, `getClientMonthGrid` | Revenue by client, by month, with totals |
| `get_aged_debtors` | `v_aged_debtors` | Who owes what, and how overdue. A thin wrapper over one view, kept so the model finds it. |
| `get_staff_pay` | `getStaffPay` | Staff and contractor pay by month |
| `get_take_home` | `v_take_home_monthly` / `_ytd` | Salary and dividends per director, per month and year to date. Also a thin wrapper, kept for the same reason. |
| `get_forecast` | `getForecastPage`, run once | Takes a `sections` argument: `months` (money in and out, take-home each, hold-backs, buffer, shortfalls), `timeline` (day by day, for a date range), `expected_money`, `bills`, `running_costs`, `accuracy`, `reserve_loan` (borrowed, each withdrawal, planned repayments), `warnings`. Defaults to `months` and `warnings`. That's one tool and one computation per question, rather than six tools that each recompute the forecast. |
| `get_corporation_tax` | `getCorporationTaxPage` | Each year's CT estimate with the working, and the reserve, estimate and rule compared |
| `get_set_asides` | `getSetAsidesPage` | Set-asides per paid invoice |
| `get_settings` | `getSettings` | Only the keys allowed in `access.ts`, such as the set-aside rate, buffer, financial year and bank account roles. Never token expiry or any future secret. |
| `sync_status` | `sync_run`, `sync_cursor` | When each resource last synced and any errors, so Claude can say how fresh its numbers are |

### Whole-picture packs

| Tool | Source |
|---|---|
| `get_analysis_pack` | `getAnalysisPackInput` → `buildAnalysisPack`: the Markdown analysis export for a period |
| `get_forecast_pack` | `getForecastPackInput` → `buildForecastPack`: the Markdown forecast export |

### Prompts (MCP prompts, shown as quick starts in Claude)

- **Month so far:** P&L to date against the last few months, cash, take-home, anything unusual
- **Can we take a dividend?** Cash after the buffer, hold-back and reserve loan, and the CT position
- **CT check:** estimate against the reserve, what's borrowed, and when it's due
- **Client concentration:** share of revenue by client, trend, and aged debt
- **Forecast review:** the next three months, the shortfalls, and how accurate the forecast has been

### Not included (on purpose)

- **Triggering a sync.** It writes to the database and calls Xero. Open question 2 covers whether to add it.
- **Changing settings, hold-backs or repayments.** These stay in the dashboard.

## Rate limits and logging

- **Per director:** 30 tool calls a minute and 1,000 a day. That's plenty for one person working with an analyst, and it stops a runaway loop quickly. Over the limit returns an MCP error telling the model to slow down.
  - **Counting:** use a count on an index of `mcp_call (user_id, created_at)`. The minute window is a tiny range scan. If that ever shows up in timings, switch to Better Auth's `rate_limit` table with an `mcp:<userId>` key.
- **`mcp_call` columns:** `id, user_id, client_id, tool, arguments jsonb, duration_ms, rows, error, created_at`. It's kept for 90 days.
  - **Pruning is new code:** the only cron today is `/api/cron/sync`, which has no pruning. Add a `delete … where created_at < now() - interval '90 days'` step to that route, after the sync.
- **Not readable by `fc_analyst`:** `mcp_call` is on the deny list.

## Hard rules this respects (from CLAUDE.md)

- **Public repo:** `schema-notes.ts`, prompts and tests contain no Tandem financial data, client names or personal data. Test fixtures are invented.
- **Read-only Xero:** no Xero calls. Only the sync route calls Xero.
- **Director check:** every request is checked as a director (the MCP's `requireDirector()`).
- **Env:** read through `src/env.ts`, URLs from `baseUrl`, and money returned as strings.
- **Migrations:** additive only and never edited after pushing.
- **No Neon locally:** local work and tests use Docker, including a local `fc_analyst` role.

## Testing

- **Query guard:** these run against `fat_controller_test` as the `fc_analyst` that global setup creates.
  - `insert`, `update`, `delete`, `create`, `set role` and multi-statement strings are all refused.
  - A slow `pg_sleep(20)` times out.
  - The row cap truncates and says so.
  - Numerics come back as strings.
  - A query passed with no values still can't run two statements.
  - `explain_query` refuses `ANALYZE` in any form: `EXPLAIN ANALYZE` and `EXPLAIN (ANALYZE, …)`, in any case.
- **Access:** these use `src/lib/mcp/access.ts`.
  - As `fc_analyst`, selecting from every denied table fails, and from every allowed one succeeds.
  - A schema test lists every table and view in the database after migrating and checks each one appears in `access.ts`, allowed or denied. A new table without a decision fails `pnpm gates`.
  - For every allowed view, read its dependencies (`information_schema.view_table_usage`, recursively through other views). Fail if any dependency is in the logins, OAuth, Xero or log groups. `settings` is allowed as a dependency.
  - `scripts/analyst-role.sql` matches what `access.ts` generates.
- **Sign-in resume:** the return target accepts `/oauth/authorize?…` and refuses `//evil.com`, `https://evil.com`, `/\evil.com` and `javascript:`.
- **Auth:**
  - after revoking, the next call gives 401, using whichever check build step 1 settles on
  - no token gives 401 with the right `WWW-Authenticate`
  - a bad, expired or wrong-audience token gives 401
  - a valid director token gives 200
  - the `.well-known` documents point at `baseUrl`
- **Tools:** each figure tool matches the store function it wraps; a snapshot of the shape, with invented data.
- **End to end, by hand:**
  1. Run `pnpm dev`, then `claude mcp add --transport http fc-local http://localhost:3000/api/mcp`.
  2. Run `/mcp` to sign in, then ask "how's this month looking?" and check it chooses its tools and SQL sensibly.
- **`pnpm gates` must pass.**

## Build order

1. **Read the docs:** install `@better-auth/oauth-provider` 1.7.7 and `@modelcontextprotocol/sdk`, then read their READMEs and types (Streamable HTTP and auth for the SDK). Record the exact API in this plan before coding, and settle:
   - JWT or opaque access tokens when `resource` is sent, and so which row the route checks for revoke
   - how the client plugin carries the authorize query through `signIn.email`, and what its response returns
   - the generated table names, for the deny list
2. **Analyst role, locally:** `scripts/analyst-role.sql`, `pnpm db:analyst`, `ANALYST_DATABASE_URL` in `env.ts` and `.env.example`, `sql.ts`, and the guard and deny-list tests.
3. **MCP route without auth, locally only:** the route plus the SQL tools, tested with Claude Code against localhost. Auth is behind a dev-only bypass that only works when `NODE_ENV !== "production"` **and** `!env.VERCEL`, and throws otherwise.
4. **OAuth:**
   - The plugin, migrations, `.well-known` routes, the consent page, the sign-in resume, `isDirector()`, the route guard and auth tests.
   - Delete the dev bypass outright, not just disable it.
5. **Figure, pack and meta tools, prompts, and `mcp_call` logging and rate limits.**
6. **Settings → Connections** (list and revoke).
7. **Production setup, by a director:**
   - Create the role in Neon, then run `scripts/analyst-role.sql`.
   - Add `ANALYST_DATABASE_URL` to Vercel production.
   - Check that the oauth-provider env needs nothing more (it reuses `BETTER_AUTH_SECRET` and `baseUrl`).
8. **Ship:** push to `main`. Migrations run in the build (`vercel.json` runs `db:migrate` first). Then:
   1. Connect from claude.ai with a custom connector at `https://<prod domain>/api/mcp`, leaving the client ID and secret empty.
   2. Run the by-hand checks against production.
9. **Docs:** a "Connect Claude" section in the README: claude.ai and Desktop connector, Claude Code `claude mcp add --transport http fat-controller <url>`, then `/mcp`.

## Acceptance criteria

- [ ] A director can add the connector in claude.ai with only the URL, sign in with their Fat Controller account, and approve access.
- [ ] Anyone who isn't a director gets nothing. No token, or an invalid one, gives 401.
- [ ] Claude can answer "how's this month looking?", "how much is borrowed from the reserve?" and "who are our slowest payers?" by choosing its own tools and SQL.
- [ ] Figure tools return exactly what the dashboard shows for the same date.
- [ ] No query can change data. Proven by tests and by the role's settings.
- [ ] `fc_analyst` can read only the allow list. It can't read logins, sessions, OAuth tokens, `jwks`, the Xero connection, `settings`, `sync_lock` or `mcp_call`, directly or through a view, and no new table is readable until it's added on purpose.
- [ ] Signing in during the Claude connection returns to the consent step, not the forecast. The return target can't redirect off-site.
- [ ] Every call is logged, and the rate limits work.
- [ ] A director can revoke a connection in Settings, and it stops working on the next call.
- [ ] No Xero call happens from the MCP.
- [ ] `pnpm gates` passes, and the repo has no secrets or Tandem data.

## Review

The plan has had two review passes against the code. Changes from them are already in the sections above.

## Open questions

1. **Read replica:** should production SQL go to a Neon read replica so heavy analysis can't slow the app? It costs a little more, and the only change is the connection string. Recommendation: not at first. Add it if `mcp_call` shows heavy queries.
2. **A `sync_now` tool:** it refreshes from Xero before answering. It writes to the cache and calls Xero through the existing sync route, which is allowed. Recommendation: leave it out at first and tell Claude to report freshness from `sync_status`.
3. **Max's access:** both directors get the same access. Should each director see only their own take-home? Recommendation: no, the dashboard already shows both.
4. **Token lifetimes:** access tokens 1 hour and refresh tokens 30 days, so the connection stays put without signing in daily. Revoking is immediate because the route checks the token row. Is that OK?
5. **Plugin API:** if the oauth-provider plugin at 1.7.7 turns out to be immature, the fallback is Better Auth's older `mcp` plugin, or a hand-rolled OAuth server like Flume's. That needs deciding after step 1.
