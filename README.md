# fat-controller

Tandem's internal finance dashboard on Xero data. See `docs/SPEC.md` and `docs/PLAN.md`.

```
cp .env.example .env.local   # fill BETTER_AUTH_SECRET and DIRECTOR_INITIAL_PASSWORD
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```
