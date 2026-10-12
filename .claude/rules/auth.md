---
paths:
  - "src/lib/auth*.ts"
  - "src/lib/session.ts"
  - "src/proxy.ts"
  - "src/app/sign-in/**"
  - "src/app/api/auth/**"
  - "src/env.ts"
---

# Auth rules

- Sign-in only: `disableSignUp: true`. Accounts come from the seed.
- Auth calls that need rate limiting (sign-in, change password) go through `authClient` → `/api/auth`; server-side `auth.api.*` calls bypass the limiter.
- `requireDirector()` in every page and server action. `proxy.ts` only checks the cookie exists.
- Build URLs from `baseUrl`/`trustedOrigins` in `src/env.ts`, never `env.BETTER_AUTH_URL`.
