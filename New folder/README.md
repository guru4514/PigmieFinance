# Pigmie — Engineering Documentation Set

**Pigmie** is a full-stack loan and micro-finance collection tracking platform. It manages loan records, repayment schedules, and field collections for an individual lender or a lending organization (branches + agents), and gives borrowers a customer portal to see their own loan status. It is a **record-keeping and operations system, not a payment gateway** — no money moves through the app; cash/cheque collections happen offline in the field and are simply logged.

This is not a summary. It is the full build spec. A developer should be able to open `03-database-schema.md`, run the DDL, open `08-backend-implementation-guide.md`, scaffold the NestJS modules as written, and be productive within a day.

## How to read this

Read `01-product-overview-and-scope.md` first — it defines what's in scope, what's deliberately out of scope, and the assumptions every other document depends on. After that, the docs can be read in any order depending on your role:

| Document | Read this if you're... |
|---|---|
| [01-product-overview-and-scope.md](./01-product-overview-and-scope.md) | Anyone. Start here. Vision, personas, full feature list, roadmap. |
| [02-architecture-and-tech-stack.md](./02-architecture-and-tech-stack.md) | Tech lead / architect. System design, stack choices with reasoning, repo layout. |
| [03-database-schema.md](./03-database-schema.md) | Backend engineer. Full DDL, ER diagram, RLS policies. |
| [04-api-specification.md](./04-api-specification.md) | Frontend or backend engineer. Every endpoint, request/response shape. |
| [05-business-logic-and-calculations.md](./05-business-logic-and-calculations.md) | Backend engineer. Interest math, schedule generation, PAR, worked examples. |
| [06-security-architecture.md](./06-security-architecture.md) | Everyone, seriously. Auth, RLS, encryption, OWASP checklist. |
| [07-frontend-implementation-guide.md](./07-frontend-implementation-guide.md) | Frontend engineer / designer. Screens, state management, offline agent app. |
| [08-backend-implementation-guide.md](./08-backend-implementation-guide.md) | Backend engineer. Module structure, guards, jobs, code patterns. |
| [09-deployment-and-testing-guide.md](./09-deployment-and-testing-guide.md) | Whoever ships it. Step-by-step free deployment, CI/CD, testing, backups. |

## The stack, in one paragraph

React + TypeScript on **Cloudflare Pages** (frontend, no commercial-use restriction, unlimited bandwidth, free). NestJS + TypeScript + Prisma on **Render** (backend API, free web service). **Supabase** for Postgres + Auth + Storage (free tier, Row-Level Security enforced on every table as defense-in-depth). GitHub Actions for CI/CD (free). UptimeRobot for a keep-alive ping that also solves Supabase's 7-day pause (free). Total recurring cost: **$0**, with an honest account of what each free tier actually limits and when you'd outgrow it — see §9 of the architecture doc and §13 of the deployment guide.

## Assumptions you should sanity-check first

A handful of judgment calls were made to turn "build Pigmie" into a buildable spec — currency, single-organization vs. multi-tenant scope, jurisdiction/compliance posture, and how far "no third party" extends. All of them are listed and justified in `01-product-overview-and-scope.md §3`. If any of them don't match your actual situation, that's the one section to revisit before writing code — everything downstream assumes them.
