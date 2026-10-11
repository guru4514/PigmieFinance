# PigmieFinance project review

Reviewed: 10 October 2026. Scope: local source, product specifications, database migration, CI workflows, builds, lint, existing unit tests, and isolated runtime probes.

## Assessment

PigmieFinance is a substantial web implementation with most planned business areas represented. It is suitable for continued development and demonstrations with synthetic data. It is not ready to be endorsed for production financial records: confirmed defects affect offline persistence, authorization, MFA, repayment schedules, reporting, audit coverage, and reproducible database setup.

Feature presence and production readiness are different. No percentage-complete estimate is justified by this review. Most remaining work is making existing functionality trustworthy rather than adding more screens.

The React/Vite frontend and NestJS/Prisma backend remain a sensible foundation for the proposed web-first, agent-mobile-later roadmap. Existing server code already supports collection UUIDs, a sync endpoint, GPS fields, photo URLs, and web push. A new agent client can reuse this foundation, but backend changes and contract verification are required.

## Verification performed

| Check | Result | Interpretation |
| --- | --- | --- |
| Frontend production build | Passed | Type checking, bundling, and generated PWA assets completed. |
| Backend production build | Passed | Backend compiles with the locally installed dependencies and generated Prisma client. |
| Existing backend unit tests | 3 suites, 10 tests passed | Coverage is concentrated on login auditing, throttling, and an alternate scheduled-job implementation. |
| Frontend lint | Passed with 8 warnings | Includes unused queue metadata and React dependency warnings. |
| Backend lint, without automatic fixes | Failed: 1,292 errors, 26 warnings | 912 messages are formatting-related; many others concern unsafe TypeScript use. These are not 1,292 security vulnerabilities. |
| Repayment generator probe | Negative final installment reproduced | A zero-interest flat loan of 100 over 200 daily installments produces a final principal/due amount of -99. These settings are permitted by the current validation if configured in a product. |
| Monthly date probe | Month overflow reproduced | Starting 31 January 2026, one monthly period returns 3 March 2026. |
| Custom MFA probe | Invalid six-digit code accepted by service | Independent verification returned `valid: false`, while `enable2FA` updated the mock staff record and returned success. No actual account was changed. |
| Generated service worker inspection | Push handlers absent | The production-generated `dist/sw.js` does not contain the handlers in `public/sw.js`. |

No production database was contacted, migrations applied, real messages sent, or credentials tested. Deployed database roles, storage policies, restore capability, browser workflows, and real devices remain unverified. The E2E test was inspected, not run against the configured database: it remains a starter `Hello World!` test, not a business-flow test. This was an assessment; application fixes were not made.

## Feature status

| Area | Implementation observed | Remaining readiness work |
| --- | --- | --- |
| Organizations and branches | Signup, profile, branch CRUD | Confirm email/OAuth onboarding, tenant bootstrap under restricted DB role, timezone consistency. |
| Authentication and roles | Supabase JWT verification, active staff/customer checks, mostly default-deny role guard | Enforce MFA at API boundary; complete per-record ownership and branch checks. |
| Staff and customers | Management, assignment, KYC status, encrypted ID number, imports, portal provisioning | Verify invitations, validate related tenant IDs, restrict fields by role, fix import failure handling. |
| Loan products and lifecycle | Products, application, approve/reject, disburse, schedules, close, default, write-off, restructure | Correct rounding/calendar policy, settlement math, concurrent state transitions, fee treatment. |
| Collections | Recording, due list, history, UUID deduplication, batch sync, reversals, receipts | Complete offline persistence on every entry path, stable retries, role enforcement, reversal concurrency. |
| Cash deposits | Recording, verification, period reconciliation | Scope by agent/branch, count cash only, handle opening balance, verify concurrency and duplicate submissions. |
| Reports | Dashboard, overdue, PAR, efficiency, agent performance, branch comparison, exports | Correct scopes and definitions; honor date/group filters; complete exports. |
| Customer portal | Own-loan queries, schedules/history, PDF statements/passbook | Close statement ownership gap; verify login routing and invitation delivery. |
| Notifications | In-app bell, subscription API, web-push sender, SMS/email adapters | Reconcile service workers and payload fields; secure settings; verify actual delivery. |
| Audit and operations | Audit decorators/interceptor, some explicit logs, CI builds, backup pipeline | Register reliable auditing, preserve history, reconcile migrations, test restore, monitor failures. |
| Agent mobile / desktop | No dedicated implementation observed | Agent app follows web stabilization; Electron can remain deferred. |

## Release blockers, ordered by impact

### 1. Privileged credentials are present in a tracked environment dump

`envs.txt` is tracked by Git and contains assignments for database connection strings, the Supabase service-role key, and the PII encryption key. Values were inspected only through redacted classification; their live validity is unknown. A Supabase anonymous/publishable key is expected in the frontend and is not equivalent to the service-role key.

Required: determine exposure, rotate affected database/service credentials if real, remove the dump from tracked content, assess repository history and access, and add secret scanning. PII encryption key replacement must include a controlled re-encryption/key-versioning procedure; simply changing the key would make existing encrypted IDs unreadable. The migration also creates `pigmie_app` with a literal dummy password, which must never become a deployment credential.

### 2. Customer PDF statements lack customer ownership checks

`pigmie-api/src/modules/portal/portal.controller.ts`, `getLoanStatement`, checks only that the caller is a customer, then calls `PdfService.generateLoanStatement(id, organizationId)`. The PDF service filters by loan ID and organization, not customer ID. Other portal loan endpoints explicitly verify ownership.

Impact: a portal customer who knows another loan UUID in the same organization can request its financial statement through this path. Organization-scoped RLS does not supply the missing customer boundary in this tenant transaction.

Required: enforce customer ownership before generating the document, apply the same rule to all portal downloads, and test customer A versus customer B as well as organization A versus organization B.

### 3. MFA is inconsistent and does not protect backend business endpoints

`pigmie-api/src/modules/auth/auth.service.ts` calls `otplib.verify` without awaiting it and treats the returned object/promise as a boolean. The installed library returns a promise of a structured verification result. The invalid-code runtime probe demonstrated erroneous success in `enable2FA`.

The frontend also uses Supabase MFA factors, while the backend stores separate custom TOTP state. `SupabaseAuthGuard` checks JWT validity and account activation but not MFA assurance. `ProtectedRoute` does not require second-factor completion. A login-page redirect is not an authorization control.

Required: select one MFA system, enforce its verified assurance at the API boundary, separate enrollment/recovery permissions, and test password-only tokens against protected actions. If retaining custom OTP, handle the library result correctly and issue an enforceable server-side proof of successful second-factor verification.

### 4. Agent and branch permissions are incomplete at individual-record endpoints

List filtering is present in several services, and customer detail/update has ownership checks. However:

- `CollectionsService.recordCollection` receives organization and staff ID, without role/branch context, and accepts any active loan in that organization. It does not ensure the loan is assigned to the agent.
- `LoansService.findOne`, schedules, and statement generation filter by organization without agent/branch restrictions.
- Loan approve/reject/disburse and several customer actions lack branch checks.
- Deposit listing receives no current-user scope; agents can request other agents' deposits.
- Document access checks organization membership but not assignment/branch ownership.
- Approval lookup/review lacks branch scope; branch managers can reach the write-off action through approval execution even though the direct write-off endpoint is admin-only.
- Customer/staff branch and assignment foreign keys are not consistently validated as belonging to the same organization. Database foreign keys check existence, not shared tenancy.

Required: centralize resource authorization, pass authenticated identity consistently to services, restrict writable fields by role, validate related tenant IDs, and test direct API requests independently of what navigation displays.

### 5. One offline collection entry path silently saves nothing

`pigmie-web/src/features/collections/pages/record-collection-page.tsx:26` defines a local no-op `queueCollection`. Its offline submission path then displays success and navigates away. The separate Today collection page imports the real IndexedDB queue, so offline behavior differs between two entry points.

Required: use one shared collection submission path. Persist every attempted collection durably before transmission, retain its UUID through uncertain network outcomes and retries, and show success only after storage or server acknowledgement succeeds. Test reload, app closure, full storage, expired login, and lost HTTP acknowledgement after server commit.

### 6. Loan calculations can produce invalid schedules and settlements

`interest.util.ts` and `schedule-generator.util.ts` round to whole currency units. Distributing those rounded values across many rows can exhaust the principal before the final row; the runtime probe produced -99. `date.util.ts` uses `setUTCMonth`, which overflows short months.

`LoansService.getPreClosureDetails` and `close` exclude `partially_paid` rows. A debt can therefore be omitted from the principal calculation and waiver processing. The close endpoint accepts an untyped body; the amount submitted is only checked against this incomplete principal figure, not the server's complete settlement quote. The displayed pre-closure penalty defaults to 2%, but the referenced configurable field is absent from the product schema.

Required: specify paise/cent rounding and month-end behavior; guarantee nonnegative rows and exact totals; calculate settlement from actual unpaid principal/interest/fees including partial payments; preserve an explicit waiver/settlement record; validate amount precision and input DTOs. Product processing fees are stored but are not applied in the reviewed loan creation/disbursement calculations; define their intended treatment.

### 7. The active late-fee job changes schedules without updating loan totals

`AppModule` imports `modules/jobs/jobs.module.ts`, which uses `ScheduledTasksService`. This implementation increments schedule `dueAmount` for late fees but does not increment the loan's `totalPayable` and `outstandingBalance`. Collection triggers derive balance from the loan total, so schedule debt and loan debt can disagree.

The alternate `src/jobs/ScheduledJobsService` updates both totals and schedules and has unit tests, but it is not the implementation wired into the app. That alternate version also tries to write `ipAddress: 'system'` to a PostgreSQL `inet` field, which would need correction before activation.

The active fee/status changes are separate operations. A failure before marking overdue or concurrent job instances can charge twice. A partial collection changes an overdue schedule to `partially_paid`, making it eligible for another fee later because there is no fee-applied marker. Jobs also use host-local dates instead of the configured organization timezone.

Required: consolidate the two implementations, create an explicit fee record/marker, update schedules and loan totals atomically, prevent duplicate job execution, and test the actual registered service.

### 8. Database migrations do not reproduce the current schema

The only checked-in migration is `0001_init`. The Prisma schema includes `KycStatus`/`kyc_status`, `two_factor_secret`, `PushSubscription`, and `ApprovalRequest` plus approval enums that this migration does not create. A local build can pass because it uses a generated client; this does not establish that a fresh database works.

The migration enables RLS, but there is no collection UPDATE policy for reversals or DELETE policies for schedule restructuring/document deletion. Auth and organization-bootstrap queries occur outside `TenantPrismaService.run`; they must be deliberately designed to function under the intended restricted database role. Owner/superuser/bypass-role connections can conceal these incompatibilities and defeat the promised tenant boundary. Current deployed roles and policies were not inspected.

Required: commit all schema changes as migrations, provision credentials separately, test setup from an empty isolated database with the intended Supabase prerequisites, run the API under a least-privileged role, and explicitly verify both permitted operations and rejected cross-tenant access. Review direct authenticated database access, especially the permissive staff update policy, as well as API access.

### 9. Audit coverage is incomplete and history is scheduled for deletion

`AuditAction` decorators are widespread. `AuditLogInterceptor` exists, but the source contains no registration through `APP_INTERCEPTOR` or `UseInterceptors`. Only explicit service writes can currently provide logs; having the decorator does not create a log entry.

If registered unchanged, the interceptor's asynchronous `tap` would not make audit persistence part of the business transaction, and collection response envelopes do not reliably supply its required entity UUID. Before/after values also need intentional selection and secret redaction.

The active scheduled service calls `auditLog.deleteMany` for records older than 90 days. This is deletion, not archival. A restricted role may block it; a privileged role may erase history.

Required: write audit entries transactionally for financial changes, include actor/reason/before/after and entity IDs, verify complete coverage, restrict modification, and replace purge with an approved retention/archive design.

## High-priority correctness and usability work

### Session and offline data isolation

The IndexedDB pending collection store is global to the browser profile and contains no user/organization ownership metadata. Sync uses whichever Supabase account is currently signed in. Logging out does not establish queue handoff or isolation. API caches use shared names and URLs without account-specific partitioning; auth profile queries use `['auth', 'me']`, and logout does not clear React Query or service-worker financial caches.

Required: partition queue/cache data by authenticated user and organization, block syncing another user's entries, define reassignment/deactivation policy for pending collections, clear ordinary sensitive caches on logout, and retain unsynced money records safely rather than deleting them silently. Test two staff accounts on one device and an expired session after hours offline.

The real queue removes every HTTP 409 as a duplicate without checking its meaning, and photo-upload failure can drop the evidence while accepting the payment. Sync is triggered on the online event/manual action rather than being demonstrated as robust background execution. A second unused `offline-sync.ts` implementation sends fetches without authentication and should be removed or reconciled.

### Receipts and collection-list behavior

The collection API returns `{status, collection}`. The Today page looks for `res.id` or `res.data.id`, so its receipt falls back to `pending`; it also computes outstanding balance from today's amount due rather than the loan's total balance. Receipts should come from acknowledged server values, with a clearly labeled provisional offline receipt.

The due-today query returns only loans with remaining unpaid schedules due by that date. Fully paid visits disappear, making it unsuitable as the sole source for completed-visit totals/history. Pending offline entries are not consistently reflected in per-customer amounts. The Today page allows multiple clicks while GPS is still being captured, before the mutation pending state begins; use a submission lock and stable operation ID.

Reversal checks and allocations lack the recording path's schedule lock. Two reversals or a reversal concurrent with a collection can use stale values. Establish one lock order covering loan state, schedule changes, fee jobs, reversals, settlement, and restructure. Existing UUID uniqueness and recording locks are useful groundwork, not proof that all concurrent paths are safe.

### Reporting and reconciliation

`ReportsService.getDashboardSummary` looks up `authUserId: user.id`, but the guard's `user.id` is the staff record ID. The lookup normally misses and disables its agent/branch filtering. Dashboard efficiency divides collected amount by remaining unpaid dues; if 80 of an original 100 is paid, the denominator can become 20 and display 400%.

Collection-efficiency date filters and `groupBy` are declared but unused in its query. Several risk/overdue reports exclude defaulted loans, which can hide the most delinquent debt; define the intended portfolio denominator and display defaulted/written-off amounts separately. Agent performance and reconciliation should preserve historical attribution when customers move between agents/branches.

Reconciliation currently sums cash, cheque, and other collections together. It reports a selected-period difference, not full cash-in-hand with opening balance. Required: separate payment methods, account for carry-over and pending deposits, agree metric definitions, and validate reports against a fixed sample ledger.

Exports advertise customers, loans, collections, and schedule. Only limited customer/loan columns are implemented; collections/schedule fall back to an `id` header. CSV field sanitization is a useful existing safeguard. Complete exports with enough relationships, balances, schedules, reversals, deposits, and audit context for useful portability.

### Notifications, settings, and onboarding

The generated Workbox service worker replaces the separate public push worker; integrate caching and push handlers into one production worker. The sender uses `body`, while the public handler reads `message`. The API returns `isRead`, while the bell expects `read`, so unread state is inconsistent. Re-register an existing push subscription with the current signed-in account and implement logout/unsubscribe/revocation behavior.

SMS settings save provider credentials in browser localStorage, but the server reads environment variables. These settings neither configure the server nor safely store a provider secret. SMS console mode reports success without delivery; bulk results also do not distinguish failed recipients. Keep privileged credentials server-side and make delivery state explicit. SMTP behavior and real push/SMS delivery were not tested.

Staff/customer provisioning calls `createUser` and then `inviteUserByEmail`, logs invitation errors, and proceeds. Verify this flow with a real isolated auth project, add recovery/compensation for partial failures, and test email-confirmation-enabled signup. OAuth signup redirects to the staff dashboard even for an unprovisioned account. Customer password login also initially navigates to the staff dashboard. Route users according to their resolved account type and onboarding state.

Frontend/backend role mismatches include accountant access to Today collections, reports, deposits, and audit logs; agent customer import; and branch-manager staff creation. Establish one permission matrix and test both route visibility and API results. Translation infrastructure exists, but many strings remain hard-coded. Currency/timezone settings are only partially honored.

### Documents and production operations

Signed-upload creation does not validate target entity ownership, and registration trusts client-supplied paths, MIME, and size. A document path should be proven to belong to the current tenant and target before the service-role client issues a download URL. Enforce size/type restrictions, private buckets, assignment checks, and cleanup of orphaned objects. Collection photo paths do not contain tenant prefixes and use public URLs; actual bucket access policies remain unverified.

The initial frontend bundle is about 1.18 MB minified / 329 KB gzip. Split routes and heavy features after correcting release blockers. Replace Vite icons with real PWA branding, add an intentional update/offline UX, and test slow networks and small phones.

CI builds both projects but does not run the backend tests or lint checks. The only E2E test expects the starter root route. Add a meaningful isolated database/auth test environment, financial regression tests, permission tests, and browser workflow checks. No frontend test runner was found.

A daily encrypted-backup workflow and local backup script exist, but successful scheduled execution and restore were not demonstrated. They use different encryption/container formats. Document and test restoration, retain keys securely, alert on failures, and define retention and recovery objectives. Add production environment checks, safe CORS defaults, HTTPS routing, monitoring, and structured error logs. Environment validation supplies `CORS_ORIGIN='*'`, while bootstrap claims a locked origin; reconcile configuration rather than depending on fallback behavior.

## Recommended delivery sequence

### Stage A: protect data and access

1. Resolve tracked credentials and key handling.
2. Fix customer statement ownership and agent/branch permissions.
3. Consolidate MFA and enforce it on the server.
4. Isolate account caches and offline queues.

Exit condition: a tested permission matrix denies access across organizations, branches, agents, and customers, including downloads and direct API calls. Account switches cannot expose or sync someone else's pending records.

### Stage B: establish financial correctness

1. Correct schedule rounding/month-end behavior and partial-payment settlement.
2. Consolidate and atomically apply late fees.
3. Fix reversal/approval concurrency and related state transitions.
4. Repair audit coverage, remove unapproved history deletion.
5. Reconcile migrations and prove restricted-role database operation.

Exit condition: a reference ledger matches schedules, collections, reversals, fees, settlement, reports, and deposits after sequential and concurrent operations. Fresh database setup and rollback/recovery procedures work.

### Stage C: complete the web pilot

1. Make both collection entry paths use one durable submission queue.
2. Correct receipts, due/completed lists, report definitions, exports, and deposit handling.
3. Complete onboarding and notification delivery; align permissions.
4. Add CI regression checks, restore demonstration, monitoring, and device QA.

Exit condition: supervised pilot users can complete their daily work; losing connectivity or restarting the browser does not lose or duplicate money records; every pending/failed sync is visible and actionable.

### Stage D: build the dedicated agent app

React Native is a reasonable continuity choice for a React/TypeScript team, but select the framework after establishing the mobile requirements and device targets. Reuse API contracts, types, validation concepts, and pure business logic where appropriate; web components and service workers are not directly reusable as native screens/background tasks.

Agent scope: secure login, downloaded assigned customers/dues, quick collection entry, GPS with timestamp/accuracy, photo capture/compression, durable local queue, sync history and failures, acknowledged/provisional receipts, cash deposit handover, push, and safe logout/device replacement.

Backend prerequisites:

- Correct authorization and MFA.
- Stable idempotency IDs with payload consistency checks and authoritative receipt/result data.
- Versioned, documented API contracts and generated/shared client types.
- Initial assignment snapshot plus pagination/delta refresh, deletions/reassignments, and server time.
- Per-item sync results, clear permanent/retryable errors, and conflict/deactivation policy.
- Tenant-owned private photo upload lifecycle and retry support.
- Native device push registration/delivery in addition to the existing web-push implementation.
- Sync/notification observability and safe concurrency.

Exit condition: real-device tests cover hours offline, app termination, OS background restrictions, account expiry, assignment changes, delayed uploads, repeated retries, and server commit followed by lost acknowledgement. A native app does not automatically solve any of these conditions.

### Stage E: optional desktop packaging

Leave Electron deferred unless users demonstrate a concrete need such as a particular printer/device integration, kiosk operation, or desktop-specific workflow. The browser dashboard can continue serving administrators and accountants.

## Minimum release verification scenarios

| Scenario | Required outcome |
| --- | --- |
| Different customer requests a known loan statement UUID | Denied without disclosure. |
| Agent submits collection for another agent's loan | Denied. |
| Branch manager acts on another branch or executes admin-only write-off | Denied. |
| Password-only session calls MFA-protected financial endpoint | Denied. |
| Valid-range small principal/high tenure; fractional amounts; zero interest | Nonnegative schedule, exact agreed rounded total. |
| Monthly loan begins on 29/30/31 January | Agreed month-end policy, no unintended skipped February. |
| Partial payment followed by settlement, reversal, or late fee | Correct principal, interest, fee, balance, and audit records. |
| Repeated job, concurrent collection/reversal, concurrent approval/rejection | One coherent final state; no duplicate charge or stale allocation. |
| Offline save through each screen, then reload/restart | Entry survives with the same operation ID. |
| Server commits but response is lost | Retry returns the same collection/receipt, no second payment. |
| User switches account with pending queue/cache | No disclosure or cross-account sync; pending records remain recoverable. |
| Fresh migration and restricted DB role | All intended flows work; forbidden access and audit modifications fail. |
| Reference ledger exported and reports compared | Figures and associations reconcile, including defaulted debt and cash carry-over. |
| Backup restored to isolated environment | Application opens the recovered data and balances match. |

## Immediate recommendation

Keep the existing architecture and the web-first direction. Prioritize Stage A and Stage B before developing the native agent client. The product already has considerable feature breadth; the next milestone should be a trustworthy, verified web pilot with safe financial records.
