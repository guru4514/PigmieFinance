# 09 — Deployment, CI/CD, Testing & Backup Guide

Everything below results in a live, production URL serving real users at $0/month recurring cost, with the free-tier trade-offs from `02-architecture-and-tech-stack.md §8–9` actively mitigated rather than hoped around.

## 1. Prerequisites

Free accounts needed: **GitHub** (repos + Actions), **Supabase** (database/auth/storage), **Render** (backend), **Cloudflare** (frontend + optional R2/DNS), **UptimeRobot** (keep-alive). A domain name is optional — every provider below issues a free subdomain, and a custom domain can be layered on later (§8) without re-architecting anything.

## 2. Supabase Project Setup

1. Create a project at `supabase.com/dashboard`. Note the **Project URL**, **anon public key**, and **service_role key** (Settings → API) — the service role key is backend-only, never shipped to the frontend.
2. Settings → Database → Connection string: copy both the **pooled** connection (port `6543`, "Transaction" mode) and the **direct** connection (port `5432`). These become `DATABASE_URL` and `DIRECT_URL` respectively (`03-database-schema.md §7`).
3. Settings → API → JWT Settings: confirm whether the project uses asymmetric (JWKS) or legacy shared-secret signing (`06-security-architecture.md §2`) — this determines exactly how `jwks-verifier.ts` is configured.
4. Storage → create two buckets: `kyc-documents` and `collection-photos`, both **private** (not public) — access is exclusively via backend-brokered signed URLs (`04-api-specification.md §6`).
5. Authentication → URL Configuration: set **Site URL** to the production Cloudflare Pages URL (or custom domain once §8 is done), and add `http://localhost:5173` (or your local dev port) to **Redirect URLs** so local development keeps working.
6. Authentication → Providers: email/password enabled (default); leave email confirmation on for staff/customer self-serve safety.

## 3. Database Migration

From the `pigmie-api` repo, locally:
```bash
# .env (local, gitignored)
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...:5432/postgres"

npx prisma migrate deploy
```
This applies every migration in `prisma/migrations/`, including the hand-edited SQL for enums, RLS policies, the `pigmie_app` role, and triggers (`03-database-schema.md §3–7`). Verify in the Supabase dashboard's Table Editor that all twelve tables exist and that the shield icon next to each shows RLS as enabled.

Also run the `pigmie_app` role creation once manually via the Supabase SQL Editor if it isn't captured as a migration in your setup (role creation is sometimes kept out of versioned migrations since it involves a password that shouldn't be in source — store that password directly as a Render secret and reference it when constructing `DATABASE_URL`/`DIRECT_URL` for the `pigmie_app` role specifically, distinct from Supabase's own `postgres` superuser connection).

## 4. Backend Deployment — Render

1. New → Web Service → connect the `pigmie-api` GitHub repo.
2. **Build command:** `npm ci && npx prisma generate && npm run build`
3. **Start command:** `node dist/main.js`
4. **Instance type:** Free.
5. **Environment variables** (Render dashboard → Environment): see the full table in §9 below.
6. **Auto-deploy:** on by default for the connected branch (`main`) — every merge redeploys automatically; no separate deploy step needed in CI (§7's workflow is the *gate before* merge, not the deploy mechanism itself).
7. Confirm `GET https://<your-app>.onrender.com/health` returns `{"status":"ok"}` once the first deploy completes.

## 5. Frontend Deployment — Cloudflare Pages

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the `pigmie-web` GitHub repo.
2. **Build command:** `npm run build`
3. **Build output directory:** `dist`
4. **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (pointing at the Render URL from §4).
5. Preview deployments on pull requests are on by default — this is the substitute for a dedicated staging environment noted in `02-architecture-and-tech-stack.md §6`.
6. First deploy lands at `https://pigmie-web.pages.dev` (or similar) — confirm it loads and can reach `/health` on the backend before moving on.

## 6. Keep-Alive — UptimeRobot

1. Free account at `uptimerobot.com`.
2. Add New Monitor → HTTP(s) → URL: `https://<your-app>.onrender.com/health` → Monitoring interval: **5 minutes**.
3. That's the entire setup. Because `/health` performs `SELECT 1` against Supabase (not a static response), this single monitor keeps both the Render service warm (preventing the 15-minute sleep) and the Supabase project active (preventing the 7-day pause) — see `02-architecture-and-tech-stack.md §8` for why one tool, not GitHub Actions, is the right one for this specific job.

## 7. CI/CD — GitHub Actions

`pigmie-api/.github/workflows/ci.yml`:
```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_PASSWORD: postgres }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npx prisma migrate deploy
        env: { DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres, DIRECT_URL: postgresql://postgres:postgres@localhost:5432/postgres }
      - run: npm run lint
      - run: npm test    # includes the tenant-isolation RLS suite — 08-backend-implementation-guide.md §8
```
Branch protection on `main` requires this check to pass before merge — that, combined with Render's and Cloudflare's auto-deploy-on-merge, is the entire CD pipeline. No separate "deploy" job is needed because the hosting providers already watch the branch.

`pigmie-web/.github/workflows/ci.yml` mirrors this without the Postgres service: `npm ci`, `npm run lint`, `npm test`, `npm run build` (catches build-time errors before Cloudflare's own build would).

## 8. Custom Domain (optional)

Both free subdomains (`*.onrender.com`, `*.pages.dev`) work indefinitely with no forced migration — this step is purely cosmetic/branding, not a functional requirement.

1. Cloudflare Pages → your project → Custom domains → add e.g. `app.yourdomain.com`. If the domain's DNS is already on Cloudflare, this is near-instant; otherwise add the provided CNAME at your registrar.
2. Render → your service → Settings → Custom Domain → add e.g. `api.yourdomain.com`, then add the provided CNAME record wherever the domain's DNS is hosted.
3. **Update three places that now need the new domains:** Supabase Auth's Site URL/Redirect URLs (§2.5), the backend's `CORS_ORIGIN` environment variable (§9), and `VITE_API_URL` in the frontend's environment variables. Missing any one of these three is the most common cause of "it worked on the `.pages.dev` URL but breaks on the custom domain."
4. TLS certificates are provisioned automatically and freely by both Cloudflare and Render — no manual certificate management at any point.

## 9. Environment Variables — Full Reference

**Backend (Render):**
| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase pooled connection, port `6543`, `pigmie_app` credentials | Runtime queries |
| `DIRECT_URL` | Supabase direct connection, port `5432` | Migrations only |
| `SUPABASE_URL` | Project URL | Used for JWKS verification |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase Settings → API | Backend-only; used for admin ops like creating a new staff member's `auth.users` entry |
| `PII_ENCRYPTION_KEY` | `openssl rand -hex 32` | Back this up outside the codebase — losing it means losing the ability to decrypt existing ID numbers |
| `CORS_ORIGIN` | Production frontend URL | Locked, no wildcard |
| `NODE_ENV` | `production` | |
| `SENTRY_DSN` | *(optional)* | If error tracking is enabled |

**Frontend (Cloudflare Pages) — everything here is `VITE_`-prefixed and therefore public in the shipped JS bundle by design:**
| Variable | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | Safe to expose |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key | Safe to expose — RLS, not key secrecy, is what protects data (`06-security-architecture.md §10`) |
| `VITE_API_URL` | Production backend URL | |
| `VITE_SENTRY_DSN` | *(optional)* | |

## 10. Testing in CI

Covered mechanically in §7's workflow; the testing *strategy* itself — what's a unit vs. integration vs. E2E test, and why the tenant-isolation suite specifically is non-negotiable — is documented in `08-backend-implementation-guide.md §8`. The one operational note here: the integration test database in CI is a disposable `postgres:15` service container per run, with real migrations (including RLS) applied fresh each time — it is never the real Supabase project, so there's no risk of test runs touching production data.

## 11. Monitoring & Error Tracking (optional, free tier)

Sentry's free tier is a reasonable addition given how much this system depends on catching silent failures in scheduled jobs and sync flows — verify current free-tier event limits at `sentry.io/pricing` before relying on them, since they're exactly the kind of number that changes. Setup is two `Sentry.init()` calls (one in the NestJS `main.ts`, one in the React `main.tsx`) plus the DSN environment variables from §9 — not detailed further here since it's genuinely optional and doesn't affect the "everything else is free" claim either way.

## 12. Backup Strategy

Supabase's free tier includes no automated backups — this is built independently, not assumed away:

```yaml
# .github/workflows/backup.yml
name: Scheduled DB Backup
on:
  schedule: [{ cron: '0 3 * * *' }]   # daily, 3am UTC
  workflow_dispatch: {}

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install postgresql-client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - name: Dump database
        run: pg_dump "${{ secrets.DIRECT_URL }}" -F c -f backup-$(date +%Y%m%d).dump
      - name: Encrypt dump
        run: openssl enc -aes-256-cbc -pbkdf2 -salt -in backup-$(date +%Y%m%d).dump -out backup-$(date +%Y%m%d).dump.enc -pass pass:${{ secrets.BACKUP_ENCRYPTION_PASSWORD }}
      - name: Upload to Cloudflare R2
        run: |
          aws s3 cp backup-$(date +%Y%m%d).dump.enc s3://pigmie-backups/ \
            --endpoint-url ${{ secrets.R2_ENDPOINT }}
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
```
This runs on GitHub Actions' schedule trigger (well within the 2,000 free minutes/month for a private repo, since it's one run a day taking well under a minute) and lands an encrypted dump in Cloudflare R2 (10GB free — `02-architecture-and-tech-stack.md §3`), which is S3-API-compatible, hence the `aws` CLI usage against a custom endpoint. A rolling retention policy (e.g., keep 30 daily + 12 monthly, delete older) is worth adding via a small script once the bucket has enough history to matter — not needed on day one.

## 13. Scaling Checklist — What to Upgrade, and When

| Symptom | Root cause | Fix |
|---|---|---|
| First request after idle periods is slow (30–60s) | Render free tier cold start | Confirm the UptimeRobot monitor (§6) is actually configured and green; if traffic still outpaces it, move to Render Starter ($7/mo, no sleep) |
| Database writes start failing platform-wide | Supabase's 500MB free storage ceiling, hit across all organizations combined (`02-architecture-and-tech-stack.md §9`) | Supabase Pro ($25/mo) — also removes the 7-day pause entirely, so this single upgrade solves two problems at once |
| One organization's heavy usage slows responses for others | Per-org rate limiting (`06-security-architecture.md §7`) not yet tuned, or genuinely outgrowing shared free compute | Tighten the per-org throttle first (cheap); if the ceiling is real usage, Render Starter for dedicated, non-shared-sleep compute |
| File uploads start failing | Supabase's 1GB free storage ceiling | Offload new uploads to Cloudflare R2 (10GB free) behind the same signed-URL pattern already in place — the backend brokering step barely changes |
| CI runs blocked mid-month | 2,000 free GitHub Actions minutes/month exhausted | Very unlikely at a few builds/day; if hit, GitHub Team is $4/user/month |

None of these are cliffs — every row has a same-day fix, and every free-tier choice in this documentation was made specifically so that the *first* real growth constraint is a clear, budgeted, single-line upgrade rather than an architecture rewrite.
