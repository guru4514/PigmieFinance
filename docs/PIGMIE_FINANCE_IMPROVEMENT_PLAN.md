# Pigmie Finance: feature review and improvement plan

Prepared: 11 October 2026. Status: researched recommendation and implementation backlog; application changes described here have not been implemented by this report.

Implementation update, 11 October 2026: backlog 01 has a published stabilization checkpoint in draft PR #2. Backlog 04 now has a verified loan-product write increment: current administrator authorization and serialized product bounds. See [loan-product verification](LOAN_PRODUCT_AUTHORIZATION_VERIFICATION.md). The remaining backlog and real-data gates are still open; this update does not mark the plan complete.

Subsequent increment: audit reads and customer deactivation use current actor checks; new collection photos use private documents with retained retry evidence; payment/reversal and cash handover have required transactional audits; defaulted repayment is supported. Development's exact metadata comparison identified a migration-checksum mismatch, update-action drift and missing indexes; no development history/DDL was changed. See [four-priority progress](FOUR_PRIORITY_PROGRESS_2026-10-11.md) for measured evidence and open schema, legacy-storage, policy and cash-reconciliation work.

## 1. Decision

Keep Pigmie focused on loan collections and cash reconciliation for a small, legally operating lending organization. Most existing backend modules support that workflow. The problem is excessive user-visible complexity, several premature capabilities and incomplete operational guarantees, rather than a collection of entirely useless modules.

Do not begin by deleting working modules or rewriting the stack. Simplify what each role sees, restrict unsupported capabilities on the server, finish correctness and recovery, and validate the resulting workflow with paying organizations. Preserve historical records and existing security improvements throughout.

The recommended product promise is: **agents can record repayments reliably, borrowers receive understandable acknowledgements, and owners can reconcile collections and cash handovers with an explanation for every difference.**

## 2. Evidence, assumptions and limits

This review inspected the registered NestJS modules, representative services/controllers, Prisma models, routes/navigation, import workflow, reports, offline queue, job logic, MFA entry points and current verification documents. External research used primary government/regulator publications and competitors' own pages. This is a targeted product/architecture review, not a complete source audit or legal certification. No real borrower data was read, users contacted, competitors purchased, interviews conducted or application features removed.

The current checkpoint records 335 backend tests in 28 suites and 62 web tests in 7 files, successful builds and named synthetic staging checks. These checks were completed in the preceding engineering work, not rerun for this documentation-only task. They do not prove every module is safe or users will adopt the product. See [release checkpoint](RELEASE_CHECKPOINT.md), [stabilization progress](STABILIZATION_PROGRESS.md) and [previous India research](INDIA_PRODUCT_VIABILITY_RESEARCH.md).

The project is in stabilization before a pilot; the release checkpoint explicitly does not approve deployment. Private document APIs, several money/assignment races and provider MFA cases have been checked, but collection-photo access, full device recovery, development schema history, runtime database privilege, fee/report/audit semantics and dependency/history cleanup remain open. Commercial demand is a separate unverified question. A completion percentage would conceal these different kinds of evidence.

Initial customer hypothesis: one reachable Indian state/district, one legally permitted lender category, roughly 2–20 field staff and a manageable loan book. This is a proposed pilot profile. State, language, legal category, willingness to pay, acquisition channel and actual operating procedures remain unvalidated. Customer discovery can proceed while engineering gates are completed.

Use the descriptor **Loan Collections & Cash Reconciliation** in demonstrations. The Pigmie name can suggest savings; test that interpretation with prospects rather than add deposit-taking functionality to satisfy a branding expectation.

RupeeCollect advertises ₹1,000/year plus GST, employee roles, web/Android access and nine languages. Finflux by M2P describes broader household, group/center and offline/digital collection capabilities. These vendor statements establish competitive offerings, not independently measured quality or adoption. Pigmie must demonstrate a concrete operational benefit rather than compete on a long menu. [RupeeCollect](https://www.rupeecollect.in/), [M2P microfinance suite](https://m2pfintech.com/micro-finance/).

## 3. Module-by-module disposition

“Keep” means needed for the selected workflow, not fully verified. “Conditional” means retain the capability but expose it only where needed and safe. “Defer” means freeze expansion; server-side entitlement/role checks must accompany any unsupported feature restriction. Hiding a button alone is not an authorization control.

| Existing module/capability | Decision | Product rationale | Improvement required |
|---|---|---|---|
| Authentication and MFA | Keep, mandatory staff security | Financial records need strong identity and immediate revocation | Finish enrollment, recovery, device/session UX and operator identity policy; retain provider MFA |
| Organization management | Keep; simplify setup | Required tenant identity and ownership | Assisted pilot onboarding; legal/service profile and consistent INR/IST defaults |
| Branches | Conditional UI; retain data model | Necessary for multiple branches and permissions; distracting for single-branch teams | Default head office; hide branch comparison/configuration until applicable; verify deactivation/assignment rules |
| Staff and roles | Keep; reduce configuration exposure | Owners need agent accountability and revocation | One permission definition reflected in API/routes/navigation; clear assignment and inactive-staff handling |
| Customers | Keep | Agent identification and borrower ownership are fundamental | Fast phone/name search, duplicates review, minimal justified fields and traceable corrections |
| Customer imports | Keep and substantially improve | Existing businesses cannot start from an empty book | Preview, mapping, row-level errors, assignment checks and separately reconciled opening loan balances |
| Loans and schedules | Keep | Repayment records require explicit contractual balances and dates | Versioned terms, authoritative calculation, tested partial/reversal/closure rules and lifecycle transitions |
| Loan products | Keep backend; simplify owner UI | Reusable policies prevent inconsistent loan setup | Start with a few approved templates; snapshot/version fees; current administrator checks within writes |
| Collections and durable outbox | Keep; highest workflow priority | The daily activity around which the product succeeds | True offline cold start/recovery, matching acknowledgements, explicit conflicts and no silent deletion |
| Receipts, statements and PDFs | Keep | Borrower transparency and dispute resolution | Shared financial source, clear pending/confirmed status, regional language and private access |
| Cash deposits/handovers | Keep; rename in UI | Distinguishes collected cash from money actually handed to the office | Call it Cash Handover & Reconciliation; include opening/carry-forward balances and inactive agents |
| Approvals | Keep critical approval infrastructure; simplify inbox | Reversals and sensitive changes need reasoned review | Define which actions require independent review, self-review policy, atomic effect/status and duplicate prevention |
| Restructuring/write-off/advanced settlement | Conditional; defer broad expansion | Real exceptions eventually need controlled handling, but business effects are complex | Server-restrict unsupported variants; retain history; no invented debt forgiveness or silent balances |
| Documents/KYC storage | Keep where justified; minimize capture | Lender requirements and evidence may need documents | Private evidence workflow, scoped grants, object validation, retention and orphan management |
| Customer portal | Optional for pilot | Useful transparency, but customers should not have to install/register to receive a receipt | Keep owner-scoped access; prioritize receipts and statements; expand only if borrowers use it |
| Reports/dashboard | Keep essential reports; defer advanced presentation | Owners need due, collected, outstanding and cash reconciliation | Define each number, date basis and population; enable drill-through; advanced comparisons later |
| Agent leaderboard/performance | Simplify to operational totals | Useful workload visibility; rankings can be misleading | Account for assignment history and date ranges; avoid a competition mechanic or punitive automation |
| Audit logs | Keep infrastructure; role-scope viewer | Explains sensitive changes and supports investigations | Atomic critical audits, minimal structured changes, retention, restricted writes and reviewed access |
| Notifications | Keep essential in-app events | Approval and sync failures must be visible | Prioritize actionable exceptions; avoid notifications substituting for a ledger |
| Email/SMS/web push delivery | Conditional; defer broad campaigns | Useful channels, but not every pilot needs every provider | Durable delivery status/retry where required, verified recipients, privacy, cost caps and staged enablement |
| Scheduled jobs | Keep necessary overdue processing; gate unverified fee rules | Consistent overdue state matters | Fee base/policy snapshots, multi-instance/replay proof and explicit classification semantics |
| Health/configuration/monitoring | Keep | A financial system needs operational visibility | Separate liveness/readiness, safe dependency failure status, bounded checks and alerts |
| EMI calculator page | Merge into loan setup; remove standalone navigation first | Useful estimate, but an extra destination and a second calculation surface | Keep shared preview/tests; prefer authoritative server quote and consistency checks |
| Language support | Keep; complete pilot language | Agents must understand errors and receipts | English/Hindi currently loaded; add the chosen language end to end and conduct usability checks |
| PWA/service worker | Keep and verify | Practical field access before native mobile | Scoped business storage, safe upgrades, offline readiness and revoked-account behavior |

No existing core backend module is recommended for immediate wholesale deletion. The parts recommended for eventual code removal are obsolete custom MFA enrollment/verification implementation after compatibility checks, redundant calculation logic after convergence, and unnecessary standalone navigation. The old scheduled-jobs file is a compatibility re-export of the registered implementation, not evidence of two active cron workers; inspect references before deleting it.

## 4. Scope to defer or exclude

Freeze expansion of Electron, a separate borrower native app, advanced branch comparisons, custom dashboards and notification campaigns. Build an agent native app only after measured PWA limitations justify it.

Do not add public savings/deposits, chit-fund workflows, a wallet/payment gateway, automated underwriting/AI scoring, credit-bureau orchestration, general GST/accounting or continuous GPS monitoring to the initial product. These are future or excluded product categories, not existing implemented modules that should be deleted. They require their own demand, legal and technical decisions.

Event-based visit evidence may be justified; compulsory photographs at every payment and background location tracking are not proposed defaults. Preserve explicit purpose, appropriate permissions and an alternative where evidence cannot be captured.

Multi-currency and international time-zone expansion should also wait. Preserve existing data/configuration safely, but focus tested pilot behavior on INR/Asia/Kolkata. Do not advertise universal currency/time-zone support based on a configuration field alone.

## 5. Concrete findings that change priority

| Finding | Inspected evidence | Implication and required action |
|---|---|---|
| Collection photos still use public URLs | `pigmie-web/src/shared/lib/offline-queue.ts` uploads directly and calls getPublicUrl | Replace with authorized private evidence references/download grants; handle old pending entries without losing photos |
| Late fees read mutable product settings | `pigmie-api/src/modules/jobs/scheduled-tasks.service.ts` reads loan.loanProduct.lateFeeValue/type | Existing loans can be affected by later product edits unless a contract-version policy is enforced; snapshot or version approved terms |
| Percentage fee uses full installment due amount | Same job computes row.dueAmount × percentage, not outstanding unpaid remainder | A partially paid installment needs the approved overdue base; verify applicable rules before enabling fees |
| Product write actor ID is not used to recheck the current actor | `loan-products.service.ts` accepts staffId, with controller role checks | Controller authorization exists, but actor demotion/deactivation between guard and write needs transaction-level review |
| Generic audits happen after the operation | `audit-log.interceptor.ts` separately persists outcome metadata and logs a failure after success | Useful metadata, but insufficient atomic evidence for every critical financial change; use explicit transaction audits |
| Customer import is not opening loan migration | Import page sends name/phone/email/address to /customers/bulk | A real business still needs agreed opening principal, interest, fees, collections and schedules; do not guess these from contact import |
| Import error contracts vary | /customers/import iterates with row errors; /customers/bulk uses createMany | Define atomic versus partial behavior; don't catch SQL errors inside an aborted transaction and claim partial success |
| Import route is exposed to agents but bulk API is not | App.tsx allows agents at customers/import; bulk controller allows admin/manager | Align role-visible actions with API authority; do not broaden server permissions just to satisfy navigation |
| Audit navigation differs from allowed route | Sidebar shows accountant audit link; route/API allow org_admin | Resolve documented permission once; initial default keeps existing admin-only restriction |
| Reconciliation selects active agents in a date window | `cash-deposits.service.ts` reconciliation filters isActive and compares window sums | Inactive-agent liabilities and previous-day carry-forward need explicit treatment; a daily difference is not a full cash balance |
| Loan interest settings are copied; fee policy is not similarly visible in Loan | Prisma Loan fields plus creation service and fee job | Preserve existing interest snapshots; extend the contract model only for missing reviewed terms |
| “Defaulted” state affects operational behavior | Job changes active loan to defaulted after its threshold; payment path currently requires active loan | Verify whether legitimate repayment/recovery on defaulted loans is rejected; define overdue/default/write-off semantics without silent reactivation |
| “Offline” banner overstates verification | App layout promises cached data; outbox is durable but real cold-start/upgrade remains open | Show readiness/stale-data status accurately; distinguish shell caching from authenticated business data availability |
| Generic module names obscure money flow | CashDeposit is an agent handover, not customer savings | Rename user-facing labels/help; keep database names stable unless an explicit migration is justified |

These are observed code patterns and review risks, not claims that every scenario was reproduced live. Required regression/integration checks appear in the backlog. Existing payment/reversal/approval and provider MFA improvements should be extended, not rebuilt from scratch.

Example for fee review only: an installment of ₹100 with ₹60 already paid leaves ₹40 unpaid. A 10% rule based on unpaid overdue amount gives ₹4, whereas the inspected calculation gives ₹10. The correct production policy also depends on contract terms and applicable law; do not retroactively rewrite historical charges without an audited reconciliation.

## 6. Financial and regulatory boundaries

Choose the lender category before defining regulatory features. RBI's digital-lending directions include disclosures, consent, grievance handling and India storage requirements for applicable arrangements. Not processing money does not automatically settle applicability. The stated delinquent-cash exception also requires same-day borrower-account reflection; an indefinite offline queue is not a sufficient operating policy where that rule applies. [RBI Digital Lending Directions](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12848&Mode=0).

The RBI microfinance FAQ describes borrower acknowledgements, household debt-burden assessment, no prepayment penalty and overdue-only delayed-payment penalties. These inform the selected segment's rules; do not apply a single generic fee model to all Indian lenders. Confirm currently applicable consolidated directions for the selected entity before pilot approval; this research is not an exhaustive amendment audit. [RBI microfinance FAQ](https://www.rbi.org.in/commonperson/English/Scripts/FAQs.aspx?Id=3366).

State licensing is a separate assessment; Karnataka provides one example. DPDP Rules 2025 have phased commencement. Product requirements must map to actual roles, jurisdictions and commencement dates rather than a blanket compliance badge. [Karnataka legislation](https://www.indiacode.nic.in/bitstream/123456789/7208/1/12_of_1962_%28e%29.pdf), [MeitY Gazette](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).

Where required for the segment, retain KFS/APR and contractual disclosure delivery, consent evidence, grievance contacts, identity/household assessment and operator licence information. Defer the corresponding new-loan origination capability if it cannot meet its requirements; do not call legally required capabilities optional merely because they are not frequently used.

Pigmie currently records payments, not bank settlement. A cheque or manually claimed digital payment needs a clearly defined received/pending/confirmed/rejected state if introduced into balance calculations. A screenshot or payment reference alone does not prove settlement. Any future digital workflow should reconcile to the lender's own account, avoid Pigmie custody and have a separate scope decision.

Do not build a general ledger in the initial product. Strengthen a narrow loan event record and agent cash record using existing transaction boundaries: opening balance, collection, allocation, reversal, charge, waiver, handover, verification and adjustment. Each material event must explain its balance effect and link to actor/source/contract policy. Derived balances require independent reconstruction checks. A materialized total must not be the sole evidence of money owed.

## 7. Target user experience

### Agent

Four primary destinations: Today, Customers/Search, Pending Sync and Cash Handover. Collection history belongs with the account or today's work. Opening the app should show whether the day's assigned records are available offline and when they were last refreshed. A loan change or access conflict must preserve the payment for review without offering a silent duplicate/new operation.

Capture only the amount, required method/reference and optional justified note/evidence. Save the original operation locally before transmission. Display a provisional local acknowledgement distinctly from server-confirmed receipt. Make conflicts visible and direct them to an authorized review workflow. Secure recovery must preserve an account's entries without exposing them to another account.

### Owner/manager

Lead with due today, collected today, outstanding, overdue and cash awaiting handover/verification. Every total needs a definition, date basis and records behind it. Put staffing, branches, product configuration and retention controls under management/settings. Put exceptions, approvals and reconciliation close together. Single-branch organizations should not have to configure a hierarchy.

### Accountant/auditor

Provide scoped statements, reconciliation and reviewed exports. Preserve current permission restrictions until a documented change is explicitly implemented and tested. Financial adjustments remain controlled writes with reason and evidence; “read-only accountant” cannot silently become an administrator.

### Borrower

Provide a clear receipt and statement in an understood language, delivered by an approved channel or printable. The portal remains opt-in. Do not require a native app to understand a balance. Avoid exposing borrower financial details in notification previews or long-lived public links.

## 8. Nine-dimension engineering policy for every work package

1. **Access:** identify the authenticated actor and current role; separate customer, staff and recovery operator.
2. **Modification:** resolve tenant, branch and assigned entity inside the relevant transaction; document supported actions.
3. **Forgery:** validate IDs, amounts, storage references, approval action and payment acknowledgements against authoritative records.
4. **Malicious client:** server permissions, capability gates and financial rules remain authoritative; UI hiding is insufficient.
5. **Direct database:** verify direct grants and the runtime role; privileged provider metadata access must not imply unrestricted application access.
6. **Secrets:** ignored environment/approved secret stores only; no raw tokens/URLs/provider bodies; minimize PII and evidence retention.
7. **Expiry:** recheck sessions, inactive actors, factor removal and assigned scope; define offline lease/revalidation without bypassing server denial.
8. **Concurrency:** preserve stable operation IDs and agreed lock order; test overlapping collection, reassignment, reversal, approval, fee job and recovery workers.
9. **External failure:** keep uncertain payments recoverable, bound provider requests, separate committed money from notification outcomes and prove retry/restore behavior.

Use the existing NestJS/Prisma and React/Vite architecture. Avoid a microservices rewrite, a second backend, two mobile frameworks or a new database as a response to these findings.

## 9. Phased plan with completion gates

The sequence below is firm; dates are not promises. Discovery and documentation can proceed alongside engineering. Money/security work is a dependency for real-data pilots. Quality gates take precedence over a calendar.

| Phase | Deliverable | Entry/dependency | Completion gate |
|---|---|---|---|
| 0: Scope and checkpoint | Chosen pilot profile, small capability list, saved/reviewed current work, route/module inventory | Current code and research | Documented supported operations, buyer interviews scheduled by human team, clear current evidence/open issues |
| 1: Correctness and isolation | Private evidence, current actor enforcement, reproducible schema, approved fee/closure/lifecycle rules, critical audit and reconciliation | Phase 0 assumptions; synthetic staging | Named real PostgreSQL/provider races and independent balance reconstruction pass; no unresolved critical financial/security defects |
| 2: Field usability and recovery | Accurate role navigation, real offline dataset/recovery, clear receipts, simple handover and pilot language | Stable financial/API contracts | Actual devices pass cold start, network loss, account switch, revocation and upgrade cases; core tasks understood |
| 3: Business onboarding and operations | Opening balance migration, restore drill, support/incident runbooks, monitoring and legal/data agreements | Phases 1–2; selected lender profile | Accountant accepts imported balances, restore verified, documented production role/storage/grants and operating responsibilities |
| 4: Controlled pilot | Three eligible organizations using measured workflows alongside existing records initially | All applicable real-data gates satisfied | Accurate daily reconciliation, adoption, measurable savings and paid renewal evidence |
| 5: Expansion decision | Agent native app or measured adjacent capability; repeatable paid onboarding | Pilot retention and unresolved device limitations | Positive commercial/operational evidence and a bounded approved next capability |

Indicative planning bands for one primary engineer with periodic accounting/legal/operator input: Phase 0 roughly 3–5 working days, Phase 1 roughly 3–6 weeks, Phases 2–3 roughly 2–4 weeks each with some overlap, and a pilot lasting 30–60 calendar days. These are initial planning assumptions, not estimates derived from completed implementation design. Re-estimate after the first three work packages; do not add the overlapping bands into a guaranteed launch date. Native work is outside this estimate.

## 10. Ordered implementation backlog

Priority P0 blocks relevant real financial use; P1 is necessary for a credible pilot; P2 waits for measured demand. Technical owner means the engineer accountable for evidence, not an already assigned person. Business/policy tasks require an accountable owner/operator and qualified advice for the exact segment.

| ID | Priority and owner | Work package | Dependency | Acceptance evidence |
|---|---|---|---|---|
| 01 | P0 / engineer | Preserve current stabilization work and inventory exact active routes, migrations and fixtures | None | Reviewed paths, secret scan of work/index, checkpoint of supported cases; no destructive reset/history rewrite |
| 02 | P0 / owner + adviser | Select lender/state/service role and financial policy boundaries | None; discovery parallel | Eligibility and data arrangement documented; prohibited/unsupported operations identified; no invented compliance badge |
| 03 | P0 / engineer | Align development schema/history safely | 01 | Exact types/defaults/FKs/indexes/grants reviewed; disposable rehearsal, preserved totals, expected migration status and empty agreed diff |
| 04 | P0 / engineer | Complete actor/scope review, prioritizing product writes, audit reads and remaining mutation paths | 01 | Current-role/deactivation/assignment races tested; direct guessed IDs and branch filters cannot broaden scope |
| 05 | P0 / engineer | Private collection evidence from outbox through viewing | 01, 04 | Forged reference denied; storage direct client access denied as designed; authorized bounded download; failed retry preserves exact original photo/payment; legacy paths have a controlled plan |
| 06 | P0 / engineer + operator | Version approved loan terms and correct fee/lifecycle semantics | 02, 03, 04 | Partial-paid fee base, product edit, defaulted repayment, waiver/closure and replay fixtures pass; old terms not silently changed |
| 07 | P0 / engineer + accountant | Reconstruct financial totals and strengthen critical transactional audits | 03, 06 | Recorded/allocated/reversed/charged/waived/settled events reconcile independently; financial action and required audit roll back together |
| 08 | P0 / engineer + accountant | Extend cash handover to complete balance/reconciliation semantics | 07 | Carry-forward, inactive staff, partial handover, pending/verified/rejected handover and dated reversal examples reconcile |
| 09 | P0 / engineer | Complete scheduled job races and operational state transitions | 06–08 | Two workers/restart/date boundary/payment overlap cannot duplicate charges or strand legitimate recovery; no reliance only on in-process cron serialization |
| 10 | P0 / engineer | Resolve runtime least privilege and provider access separation | 03, 04 | Direct roles denied; runtime privilege/tenant isolation demonstrated; session validation has narrowly justified provider access; service-role storage requests scoped |
| 11 | P0 / engineer | Finish credential/history/advisory work appropriate to rollout | 01 | Current and staged scans; compatible dependency decisions recorded; remote secrets reviewed; coordinated history cleanup plan/action distinguished; no forced unsafe downgrade |
| 12 | P1 / engineer | Align role route/menu/API contracts and simplify navigation | 04; can precede larger UI changes | Agents have no dead import action; accountant audit link agrees with retained permission; capabilities guarded on server; direct route tests pass |
| 13 | P1 / engineer | Authoritative loan preview and simplified templates | 06 | Preview/final schedule invariant fixtures match for supported inputs; standalone navigation removed without deleting needed calculation/quote behavior |
| 14 | P0 for offline field use / engineer | Offline assigned data, readiness, conflicts and operator recovery | 04–07 | Real staging/device cold start, expired session, reassignment, browser restart, two tabs, disk failure and upgrade scenarios; safe revocation/staleness behavior documented |
| 15 | P1 / engineer + users | Fast recording, readable receipt and pilot language | 12–14 | Provisional vs confirmed understood; no forced evidence at every payment; task timing measured; complete translated errors/help/receipts |
| 16 | P1 / engineer + accountant | Unified safe import and opening balance migration | 03, 06–08 | Preview and mapping, reimport idempotency, duplicates review, clear row errors, approved opening schedules/allocations and export round-trip verification |
| 17 | P0 operational / engineer | Backup, restore, monitoring and incident response | 03, 07, 10 | Actual database/auth-link/storage restoration plan rehearsed; last recoverable point/totals recorded; secret-safe logs and alerts; stopped API/provider outages handled |
| 18 | P1 / engineer + operator | MFA/browser recovery and provisioning journal | 04, 10 | Lost-device/terminated-user/account switch UX; durable attempt/completion evidence without secret payload; no orphan cleanup deletion races |
| 19 | P1 / owner + adviser + engineer | Data notices, retention, borrower disclosures and grievance workflow | 02, 06, 10, 17 | Exact applicable policies and contracts approved; receipt/disclosure access verified; lawful retention exceptions and erasure paths distinguished |
| 20 | P1 / engineer | Notification channel gates and delivery accountability | 18, 19 | Core workflow independent of push; no unauthorized recipients; channel-specific costs/consent; failed required delivery visible and retryable |
| 21 | P1 / owner + support | Discovery, assisted onboarding and paid offer | 02; runs alongside technical work | Observed baseline workflow, onboarding time, price objections and named support responsibilities; no automatic external outreach |
| 22 | P1 / owner + accountant + engineer | Controlled pilot and renewal decision | Applicable 03–20 gates | Daily agreed totals, safety evidence, adoption/time comparisons and paid renewals; stop conditions enforced |
| 23 | P2 / engineer + owner | Agent native app if device evidence requires it | 22 | One platform/framework choice; documented API/sync/upload/version contracts; parity/race/recovery tests; no promise backend changes are unnecessary |
| 24 | P2 / owner + engineer | External digital repayment verification or wider borrower portal | 22 and demonstrated demand | Method/settlement/duplicate states and lender-account reconciliation reviewed; no product custody; portal adoption/privacy measured |

Some P1 tasks become P0 for the chosen pilot: language if users cannot understand the interface, opening migration if existing balances enter the system, required disclosures/delivery for the applicable lending model, and recovery if the product becomes the primary record. Priority must follow the actual exposure, not only the label.

## 11. First implementation sequence

Start discovery immediately through the human business team; no real borrower data is required to observe or demonstrate a synthetic workflow. In the codebase, complete 01 and scope 03/04 first. Then deliver private collection evidence (05) and policy/fee fixes (06) as separate reviewable increments. Add focused regressions and real staging integration per increment. Do not combine schema reconciliation, photo migration, MFA changes and navigation redesign into one enormous unreviewable change.

After the first three increments, revise effort estimates and remaining risks. Current tests/builds are useful baseline evidence; repeat relevant tests after meaningful changes, broaden only when scope/failures warrant it. Do not add tests that merely mirror trivial UI labels or use blanket auto-fix/staging commands across unrelated pending work.

Navigation simplification can proceed once the permission decision is documented, but it is not a substitute for money/storage correctness. Opening loan migration must wait for financial rules. Real-money dependence waits for restore, isolation and applicable legal gates.

## 12. Definitions needed before implementing money changes

Create one versioned policy register with examples for:

- cash business date versus device collected-at and server recorded-at;
- installment count/frequency, holiday handling, cash denomination and final rounding residual;
- principal/interest/fee allocation, partial payment and overpayment credit;
- approved fee base, rate, cap, grace period and repeatability;
- early closure quote, accrued interest, permitted charges and quote expiry;
- reversal of a previously recorded or handed-over payment;
- overdue versus defaulted versus written-off debt and subsequent recovery;
- physical cash holder, handover recorded, independently verified receipt and carry-forward;
- received versus confirmed cheque/digital repayment if supported;
- report population, historical assignment, cut-off date and denominator.

Existing combined paid amounts cannot reliably reveal principal/interest allocation. Record the agreed method; flag ambiguous historical entries for reconciliation instead of manufacturing precision. Do not migrate amounts merely because the current dataset is temporary. A correct migration procedure should preserve any future customer data.

## 13. Deployment and recovery acceptance

Use synthetic staging for all failure/race checks. Keep credentials exclusively in ignored environment files or approved stores; records/backups must follow a separately approved secure storage process, never unignored SQL dumps or credential-bearing scripts. Verify production configuration separately from staging.

Test real browser/device behavior for at least: initial online preparation → airplane-mode cold start; payment local commit; process/browser kill; reconnect/lost acknowledgement; expired/revoked session; new account on the same device; assignment change; image upload failure; multiple tabs; storage quota/eviction; and service-worker upgrade. Initial enrollment requires provider connectivity; do not advertise unrestricted offline login. An offline authorization lease must have an explicit stale/revocation policy and cannot authorize a server request after revocation.

A browser outbox alone cannot guarantee survival of device loss or storage eviction. Document supported recovery, warning thresholds and limitations; investigate native storage only if measured needs warrant it. A manually exported encrypted recovery artifact, if proposed, needs explicit ownership, key and retention design before implementation.

Proposed operating objectives are recovery point at most 15 minutes and restoration within 4 hours, subject to budget/provider capabilities. These are proposed targets, not current guarantees. Measure a restore drill before advertising them; decide whether the organization's risk tolerance permits the remaining recovery window. During pilot shadow operation, retain the agreed independent source of truth until switch-over criteria are met. Backup presence is not proof of restore, and an export is not a complete auth/storage restore procedure.

Critical audit evidence must be persisted with the financial change or through an explicitly verified durable mechanism. Generic outcome logs can remain supplemental. Minimal structured amounts/reasons/source IDs are appropriate; full request bodies, raw identity numbers, MFA secrets and provider payloads are not. Retention and tamper resistance require database/control evidence, not a user-facing “immutable” claim.

## 14. Pilot scorecard and business model

Before recruiting the pilot, the human business team should conduct approximately 10 owner/manager interviews, 10 agent workflow observations and 5 borrower/accountant conversations across 3–5 candidate organizations. Ask about a recent mismatch, actual recording/day-closing time, phone and language constraints, opening balances, current software cost, who approves purchase and what would justify switching. Demonstrate synthetic cases and record refusal reasons. Avoid leading questions and real borrower records without appropriate controls. This proposed discovery work has not been performed by the research task.

Before real data: finish applicable release gates, agree roles/data processing and lender eligibility, and reconcile sample opening balances with an independent accountant/operator. Run three organizations and approximately 5–10 agents for 30–60 days. This is a practical learning sample, not a statistically representative Indian market study.

| Metric | Proposed decision threshold |
|---|---|
| Financial correctness | Zero lost/duplicate acknowledged payments; every discrepancy investigated and explained |
| Access/privacy | No tenant exposure; verified revocation, private evidence and restore |
| Adoption | At least 80% of participating agents use it on working days by week four |
| Recording time | Median under 20 seconds after finding the account; compare with observed baseline |
| Reconciliation time | At least 30% reduction against baseline, without extra unresolved exceptions |
| Payment | At least two of three organizations pay the quoted price for a subsequent period |
| Retention | Continued core use after intensive onboarding and initial novelty |
| Support | Measure support minutes per organization and unresolved critical tickets; demonstrate a sustainable service cost |

Thresholds are proposed, not achieved. Stop pilot expansion on a material privacy failure, wrong balances, unrecoverable acknowledged payments or illegal/unsupported operation. Preserve evidence, reconcile affected records and fix the cause before resuming.

Test an organization subscription around ₹999–₹1,999/month for a team receiving tangible reconciliation and onboarding value. This is a willingness-to-pay experiment, not researched market pricing. A very low advertised competitor price means basic ledger features alone may not justify it. Separate metered messaging and costly onboarding transparently; no deceptive unlimited promise.

Track acquisition source/cost, setup time, support time, retained paying organizations, reasons for refusal and actual gross contribution. Illustrative arithmetic: 100 organizations at ₹1,499/month produce ₹149,900 monthly gross revenue before taxes, churn and expenses; this is not a sales forecast. Do not derive SaaS revenue from the total value of loans in India.

If workflows are accurate but agents avoid the product, simplify the experience before adding modules. If users operate it daily but refuse a sustainable price, revisit segment, packaging or acquisition/support costs. If demand is primarily pigmy savings or chit funds, treat that as a separate product decision rather than silently stretching the loan schema.

## 15. Native mobile and deferred capability gates

Keep the web dashboard. Build a native agent app only after evidence of unmet storage/recovery, background synchronization, camera, GPS or distribution needs and sufficient customer demand. Choose one framework based on team capability/device requirements; do not build both React Native and Flutter. Existing backend code is reusable, but versioned sync contracts, attachments, push lifecycle and conflict semantics may require API work.

Portal expansion requires borrower usage and a workable recovery/delivery model. Branch comparisons require real multi-branch demand and trustworthy historical attribution. Restructuring/write-off requires approved financial effects and corresponding reports; preserving an administrative action is not proof of complete accounting. Automated fees require snapshots, lawful base and tested replay/concurrency. Paid SMS requires a budget and applicable provider/consent setup. Savings/chit/payment custody require a new legal/product assessment.

## 16. Work that must never be removed to look simpler

Do not remove staff MFA, authorization, tenant isolation, transaction locks, stable payment IDs, reversal history, controlled critical approvals, private evidence, financial reconciliation, required borrower disclosures, monitoring or recovery. Keep this complexity in the system where it protects users; reduce unnecessary choices on screen.

Do not delete existing financial or audit rows to hide unsupported features. Do not enable cleanup that can delete provider identities without confirming every supported linking path. Do not rewrite Git history from the current large uncommitted checkout or change remote secrets without a verified plan. Do not interpret synthetic data as permission to weaken future production controls.

## 17. Evidence map

- Registered modules: `pigmie-api/src/app.module.ts` and `pigmie-api/src/modules/`.
- Permissions/navigation: `pigmie-web/src/App.tsx`, `shared/components/layout/sidebar.tsx`, `mobile-bottom-nav.tsx`; matching backend controllers.
- Existing customer import: `pigmie-web/src/features/customers/pages/import-customers-page.tsx`; customer bulk/import service paths.
- Financial settings and jobs: `pigmie-api/prisma/schema.prisma`, `modules/loans/loans.service.ts`, `modules/loan-products/loan-products.service.ts`, `modules/jobs/scheduled-tasks.service.ts`.
- Generic audit: `pigmie-api/src/common/interceptors/audit-log.interceptor.ts`; explicit service audits and current verification documents must be considered alongside it.
- Outbox/evidence/PWA: `pigmie-web/src/shared/lib/offline-queue.ts`, `pigmie-web/vite.config.ts`, document service and [document verification](DOCUMENT_ACCESS_VERIFICATION.md).
- Language: `pigmie-web/src/shared/lib/i18n.ts`.
- Existing evidence: [staging verification](STAGING_VERIFICATION.md), [schema reconciliation](DEVELOPMENT_SCHEMA_RECONCILIATION.md), [MFA recovery](MFA_RECOVERY.md), [assignment races](ASSIGNMENT_RACE_VERIFICATION.md), [provisioning recovery](PROVISIONING_RECOVERY.md).

This plan supersedes feature-priority assumptions, not verified historical evidence. Existing docs should be aligned during implementation so design intentions, completed changes, measured tests and open gates remain distinguishable.
