# 01 — Product Overview & Scope

## 1. Vision

Pigmie digitizes the field collection model used by small lenders and micro-finance operators: an agent visits a customer on a fixed schedule (daily, weekly, or monthly), collects a small cash installment, and that has to be tracked accurately against a loan balance across potentially hundreds of customers and dozens of agents. Today this is typically run on paper ledgers or scattered spreadsheets — error-prone, hard to audit, and impossible for a customer to verify independently.

Pigmie replaces the ledger, not the cash. It gives:
- **Staff** (admins, branch managers, agents) a system to originate loans, generate repayment schedules, and record every collection with an auditable trail.
- **Customers** a portal to see their own loan status, schedule, and payment history without having to ask the agent or trust a paper receipt book.
- **The organization** portfolio-level visibility: what's outstanding, what's overdue, which agents are performing, and how much cash should be in hand versus what's actually been deposited.

## 2. What Pigmie Is / Is Not

**Is:**
- A system of record for loans, repayment schedules, and collection events.
- A workflow tool for loan application → approval → disbursement → collection → closure.
- A reporting and analytics layer (overdue tracking, portfolio at risk, agent performance, collection efficiency).
- A customer-facing, read-mostly portal.

**Is not, by explicit design:**
- **Not a payment gateway.** No card, UPI, wallet, or bank transfer processing happens inside the app. A "collection" record means *"₹X was physically handed to an agent"* — it is a log entry, not a transaction. This was the person's original brief and it shapes the entire architecture: no PCI scope, no payment-provider integration, no reconciliation-with-a-processor logic.
- **Not an accounting/GST/tax filing system.** It tracks loan-level principal and interest, not organization-wide books of account. If the operator needs formal accounting, Pigmie's CSV/Excel export (§6, Reports) feeds into that separately.
- **Not a credit bureau or scoring service.** No external credit-check integration. If that's wanted later, it's an isolated, opt-in addition (see §7).

## 3. Assumptions (read this before building anything)

The brief said to make sensible assumptions rather than stall on questions, so here they are — explicit, numbered, and each with the reasoning behind it. If your real situation differs from one of these, revisit the relevant section before you start; most of the documentation set is written to be consistent with these choices.

1. **Multi-tenant SaaS from day one — one hosted deployment, many organizations, not a self-hosted product.** This is being built to serve many users, not run as a private instance one operator installs for themselves. Pigmie is a single running deployment that different lenders/organizations sign up to and use, each seeing only their own data. Every business table carries `organization_id`, and Postgres Row-Level Security enforces that boundary as a **load-bearing security control**, not a defense-in-depth nicety — with real, unrelated businesses' financial records sharing one database, a missing `WHERE organization_id = ...` in application code must be caught by the database itself, not only by code review. See `03-database-schema.md §5` and `06-security-architecture.md §2` for exactly how. Organization signup is self-service (`POST /organizations`, `04-api-specification.md §3`): the first user to register an organization becomes its `org_admin` automatically, no platform staff in the loop. One important consequence: every free-tier ceiling discussed in `02-architecture-and-tech-stack.md §9` is a shared budget across *all* organizations on the deployment, not a per-operator allowance — read that section with this in mind, and expect to cross from Supabase's free tier into its $25/mo Pro tier once there's real multi-organization traction, not as a failure of the plan but as its natural next step.
2. **"Free" means free cloud infrastructure, not zero-infrastructure.** A public web app has to run somewhere. "Free" is interpreted as *free tiers of managed infrastructure providers* (hosting, database, CI/CD) rather than fully self-hosting on owned hardware, which isn't realistic for a small team and shifts security burden (patching, physical access, backups) onto them. Every provider recommended in `02-architecture-and-tech-stack.md` has a genuinely free-forever tier as of August 2026, verified against current pricing pages — not a time-limited trial. Where a free tier has a real gotcha (Supabase's 7-day pause, Render's cold start), it's called out explicitly with a mitigation, not glossed over.
3. **Third-party managed services are permitted; third-party *fintech* services are not.** Per clarification, Supabase, Neon, Cloudflare, Render, and similar infrastructure/BaaS providers are in scope. What remains out of scope is any third-party *payment processor, credit bureau, or lending-as-a-service API* — because the product's own premise is that it does not move money. Using Supabase for Postgres+Auth+Storage is infrastructure, the same category as "which company's server rack;" it is not a fintech dependency, and it materially improves security over hand-rolled auth (see `06-security-architecture.md §2`).
4. **Currency is configurable; worked examples use ₹ (INR).** "Pigmie" and the daily-collection model strongly echo the Indian *pigmy deposit* scheme (small daily door-to-door collections, historically popularized by Syndicate Bank). The system is currency-agnostic (`organizations.currency`, ISO 4217), but all worked examples in `05-business-logic-and-calculations.md` use INR since that's almost certainly the operating context. Swap the symbol; the math doesn't change.
5. **Compliance and licensing are the operator's responsibility, not the app's.** Lending, even small-scale, is regulated in most jurisdictions (in India: RBI money-lending rules vary by state; data protection falls under the DPDP Act 2023; elsewhere, GDPR or local equivalents apply to storing customer PII). This documentation is engineering guidance, not legal advice — it builds in reasonable technical safeguards (encryption, audit trails, data export, consent flags) but the operator must confirm their own regulatory obligations with a lawyer before going live. This gets one more explicit callout in the security doc and is not revisited elsewhere.
6. **Staff accounts are provisioned by an admin, not self-registered.** There's no public "sign up as an agent" flow. An Org Admin creates staff accounts. This is standard for internal operations tools, removes an entire class of spam/abuse-prevention problems, and matches how these organizations actually hire.
7. **Customers get portal access opt-in, granted by staff.** A customer doesn't self-register either — a staff member enables portal access on an existing customer record, which triggers an invite. This matches reality (a customer becomes a customer through a loan application processed by an agent, not through a marketing funnel).
8. **No SMS is included in the free/core build.** Every SMS gateway is metered and paid — there's no free tier that doesn't cap out immediately at real usage. In-app notifications and, optionally, free-tier transactional email (see §7) cover the core build. If SMS reminders are a hard requirement later, budget for it explicitly (e.g., MSG91, Twilio) — it's the one place this document won't pretend a free option exists.

## 4. Glossary

| Term | Meaning |
|---|---|
| **EMI** | Equated Installment — the fixed amount due at each collection interval (despite the "monthly" in the common expansion, Pigmie generalizes it to daily/weekly/monthly). |
| **Tenure** | Total number of installments over the life of a loan. |
| **Flat interest** | Interest calculated once on the original principal for the full tenure, regardless of how much has been repaid. |
| **Reducing balance interest** | Interest calculated on the outstanding principal at each period, so it shrinks as the loan is repaid. |
| **PAR (Portfolio at Risk)** | Standard micro-finance risk metric — the proportion of the total outstanding portfolio that is overdue by more than *n* days. See `05-business-logic-and-calculations.md §7`. |
| **Collection efficiency** | Amount actually collected in a period, divided by amount that was due in that period. |
| **Pigmy / Pigmie collection** | Door-to-door, small-denomination, high-frequency (often daily) deposit or repayment collection model. |
| **Write-off** | A loan marked as uncollectable; removed from active portfolio but retained in records for audit. |
| **KYC** | Know Your Customer — identity verification documentation collected at onboarding. |

## 5. Personas & Roles

| Role | Who | Core needs |
|---|---|---|
| **Org Admin** | Business owner / operator | Full control: staff, loan products, branches, all reports, all records. Only role that can write off a loan or view the audit log. |
| **Branch Manager** | Runs a branch (optional, for multi-branch orgs) | Approve/reject loans, manage agents and customers within their branch, branch-level reports. |
| **Collection Agent** | Field staff, visits customers | Record collections (offline-capable), see their assigned customer list and today's due list, deposit cash to admin. |
| **Accountant / Auditor** *(optional role, Phase 2)* | Reviews financial integrity | Read-only access to all loans, collections, and the audit log; cannot record or approve anything. |
| **Customer / Borrower** | The person repaying a loan | View their own loan(s), schedule, payment history, and download a statement. Read-only. |

`06-security-architecture.md §3` defines the exact permission matrix for each role.

## 6. Core Feature List

Each of these is expanded to implementation detail in the linked document — this is the index, not the spec itself.

1. **Authentication & Authorization** — Supabase Auth, JWT-based, RBAC, optional TOTP 2FA. → `06-security-architecture.md`
2. **Organization & Branch Management** — org profile, currency/timezone config, branch hierarchy. → `03-database-schema.md`, `04-api-specification.md §3`
3. **Staff Management** — admin-provisioned accounts, role assignment, deactivation. → `04-api-specification.md §4`
4. **Customer Management** — profile, KYC document upload, guarantor info, agent assignment. → `04-api-specification.md §5`
5. **Loan Product Configuration** — interest type/rate, frequency, tenure bounds, late fee rules, all configurable per product. → `03-database-schema.md`, `05-business-logic-and-calculations.md`
6. **Loan Lifecycle** — application → approval → disbursement → active → closed/defaulted/written-off, with a full state machine. → `05-business-logic-and-calculations.md §6`
7. **Repayment Schedule Generation** — automatic, based on product config, at disbursement time. → `05-business-logic-and-calculations.md §3`
8. **Collection Recording** — agent logs a cash/cheque collection against a loan; auto-applied to the schedule. → `04-api-specification.md §8`, `05-business-logic-and-calculations.md §4`
9. **Offline-First Agent Collection Flow** — PWA with local queue + background sync, since field connectivity is unreliable. → `07-frontend-implementation-guide.md §8`
10. **Cash Reconciliation** — agent cash-in-hand vs. amount deposited to the org, tracked and verified. → `04-api-specification.md §9`
11. **Customer Portal** — loan status, schedule, payment history, downloadable statement. → `04-api-specification.md §11`
12. **Reports & Analytics** — overdue list, PAR, collection efficiency, agent leaderboard, exportable. → `04-api-specification.md §10`
13. **Document Management** — KYC docs, loan agreements, collection receipt photos, in Supabase Storage. → `03-database-schema.md`
14. **In-App & Web Push Notifications** — due-date reminders, approval notices. → `07-frontend-implementation-guide.md`
15. **Audit Trail** — immutable log of every state-changing action, who did it, when, before/after values. → `06-security-architecture.md §9`
16. **Bulk CSV Import** — migrate existing customer/loan data from spreadsheets. → `04-api-specification.md §5`

## 7. Additional Recommended Features

These weren't explicitly requested, but each one directly serves the stated goals (security, real-world usability, trust) and is cheap to build now versus retrofit later — included per the instruction to recommend additions that naturally improve the product.

- **Geo-tagged, photo-verified collections.** Capturing GPS coordinates and an optional photo at the moment of collection is the single highest-leverage anti-fraud feature for a cash-collection system — it directly answers "was the agent actually there?" in a dispute. Cheap: browser Geolocation API + Supabase Storage upload, both free.
- **TOTP-based 2FA** (Google Authenticator–compatible) instead of SMS OTP. Genuinely free (no gateway), more secure than SMS (immune to SIM-swap), and works completely offline for the agent's initial login.
- **Auto-generated PDF receipts and statements**, rendered server-side, viewable in the portal or downloadable — replaces a paper receipt book without needing any SMS/WhatsApp API integration.
- **Loan restructuring workflow.** Real-world micro-finance always needs to handle a customer who's fallen behind — reschedule remaining installments rather than forcing a binary "current or defaulted" state. Missing this is one of the most common gaps in first-pass loan trackers.
- **Portfolio-at-Risk and collection-efficiency dashboards**, computed from data you're already capturing — these are the two metrics a lender actually manages the business by, and they cost nothing extra to add once collections are recorded correctly.
- **Full immutable audit log.** For a financial records system, "who changed this and when" isn't optional — it's what makes the system trustworthy enough to replace a paper ledger in a dispute.
- **Self-service data export (CSV/Excel of everything).** The organization should never feel locked in to a free-tier tool; being able to export the entire portfolio at any time is both a trust signal and a disaster-recovery safety net.
- **Multi-language UI (i18n).** Micro-finance customer bases are frequently multilingual/regional; React's i18n tooling makes this close to free to bake in from the start versus retrofit.

## 8. Phased Roadmap

Build in this order — Phase 1 alone is a usable, demoable product.

**Phase 1 — MVP**
- Organization self-signup (`POST /organizations`) — without this, no new tenant can ever get onto the platform, so it ships before almost anything else
- Auth (Org Admin, Agent roles), staff CRUD
- Customer CRUD + document upload
- Loan product config
- Loan creation → manual approval → disbursement
- Repayment schedule auto-generation
- Collection recording (online form; not yet offline-first)
- Basic dashboard: today's due list, overdue list
- Customer portal: view loan, schedule, payment history (read-only)

**Phase 2 — Field-Ready**
- Offline-first PWA for agents (service worker, sync queue)
- Geo-tag + photo on collections
- Cash deposit reconciliation
- Reports: PAR, collection efficiency, agent performance
- Full audit log
- TOTP 2FA
- PDF receipt + statement generation
- Bulk CSV import

**Phase 3 — Scale-Ready**
- Loan restructuring
- Branch Manager and Accountant roles, branch hierarchy
- Multi-language UI
- Web push notifications
- Optional transactional email (password reset, due-date reminders)
- Automated backup pipeline
- Lightweight platform-admin visibility (a small, separately-authorized capability to list organizations and act on abuse/support requests — cross-tenant by nature, so it's scoped narrowly and audit-logged even more strictly than normal staff actions; see `06-security-architecture.md §3`)

## 9. Non-Functional Requirements (summary)

- **Security:** field-level encryption for PII, RLS on every table, full audit trail, no plaintext secrets — detailed in `06-security-architecture.md`.
- **Availability:** free-tier hosting means accepted trade-offs (Render cold start, Supabase pause) — both are mitigated with a documented keep-alive strategy in `02-architecture-and-tech-stack.md §8`, not silently ignored.
- **Data integrity:** loan balance and schedule state are derived/updated inside database transactions, never computed ad hoc on the client — see `05-business-logic-and-calculations.md` and `08-backend-implementation-guide.md`.
- **Portability:** no proprietary lock-in — Postgres, standard REST, and full data export mean the operator can move off any single provider without losing data.
