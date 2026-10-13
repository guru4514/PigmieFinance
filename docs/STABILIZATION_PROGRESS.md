# Stabilization progress

## Current status — 2026-10-14

Runtime isolation continuation: migration 0009 is verified in development and staging; the API requires a restricted non-owner/non-BYPASSRLS login and scoped transactions. Actual financial/provisioning integration, provider MFA HTTP recovery/revocation and compiled development startup passed. Browser push registration has safe organization-switch recovery and a reconnect action. Backend 502 tests and web 83 tests passed. See [runtime rollout](RUNTIME_ROLLOUT_VERIFICATION.md) and [release checkpoint](RELEASE_CHECKPOINT.md) for deployment boundaries and remaining gates. Earlier runtime-role descriptions below are historical.

Latest orchestrated integration: migration 0008 removes residual browser non-CRUD rights and future postgres/public default rights, with original records/history preserved in both environments. Independent financial reconstruction and dashboard fulfillment/overdue/PAR corrections passed synthetic staging integration; compatible dependency patches clear the web audit and remove critical backend findings. Current work and remaining runtime/legacy/advisory/hardware/recovery gates are recorded in [release checkpoint](RELEASE_CHECKPOINT.md). Earlier test counts below are historical.

The interruption has been recovered and the financial, browser recovery and platform restore changes integrated. [Four-package execution](FOUR_PACKAGE_EXECUTION.md) records the current evidence: seven migrations applied in both environments with original rows/history preserved; immutable loan amendments; exact payment/settlement components and reversals; verified desktop offline recovery; and actual encrypted final-schema database/Auth/Storage restores with a private synthetic blob. Historical source reconciliation, physical devices and independent off-site/escrow/hosted restore remain explicit release gates. The project is not yet approved for production. The dated entries below are historical evidence rather than the current unfinished-code list.

## Historical checkpoint — 2026-10-11

The historical lists below describe findings at the time of each batch. This section supersedes those lists; the project is **not yet release-ready**.

Implemented locally: durable account-owned collection retry; customer statement ownership; mandatory provider MFA for staff; explicit role/tenant/branch/assignment checks on reviewed routes; financial rounding/dates and early-closure quotes; locked payment/reversal/fee workflows; atomic approval action/review; safe staff field selection; scoped cash-deposit review; report identity, response contracts and CSV exports; account cache isolation and generic push contents; compatible dependency patches; isolated staging launch and application delivery suppression.

Current verification: API build passed; full backend suite passed **335 tests in 28 suites** after organization access, serialized provisioning recovery and document authorization hardening. Actual staging checks confirmed concurrent onboarding, current administrator enforcement, competing orphan cleanup workers and private synthetic document upload/download; all fixture objects, records, provider identities and newly created fixture buckets were removed. Earlier financial, MFA, portal, staff and notification checks also passed. Staging configuration checks passed **6 tests**. Web suite passed **62 tests in 7 files**, build passed, lint has five existing warnings and no errors. Focused backend lint passed. Browser checks using synthetic responses confirmed report values, offline messaging, error and retry recovery. Live PostgreSQL/provider evidence is recorded in [staging verification](STAGING_VERIFICATION.md); it does not establish full application-wide review or production readiness.

Production dependency audit: web **0 findings**; API **4 high findings** remain in Prisma's dependency chain. No forced major downgrade was applied. Build/tooling advisories need separate review.

Credential remediation update: independently confirmed historical development password rejection on both poolers, legacy service/anonymous key rejection and successful replacement credentials (eight live checks). Independently replaced the subsequently disclosed development encryption key and re-encrypted both existing test ID fields, which were readable only with the historical key. The actual application encryption service now reads both fields using the saved fresh key; all other test records were preserved. No legacy custom MFA secrets were stored in either checked database. Current source/build secret-match checks passed. Historical inventory found known leaked credentials only in `envs.txt` across 125 reachable commits/1,078 blobs; cleanup is prepared but not executed. Added local/index and CI secret checks (11 detection/configuration tests passed). Retained ciphertext/backups and remote configuration remain separate review work. See [security remediation](SECURITY_REMEDIATION.md).

Staging: `pigmie-finance-staging` is configured in the existing PigmieFinance organization on the free plan, Mumbai: `sjelnxrlkrvwjcgqbvre`. Verified TLS connections use Supabase's CA. All four migrations are applied; Prisma reports an empty schema diff. Live checks passed for payment/reversal/approval concurrency, settlement/audit rollback, reconciliation of tested totals, direct client denial, real provider MFA/API enforcement and inactive-staff denial. Synthetic fixtures/provider accounts were removed. API startup/health and unauthenticated HTTP denial passed; the temporary API was stopped after verification. See [staging setup](STAGING_SETUP.md).

### Remaining release blockers

- Reconcile the existing runtime database against the now-complete migration history before any production migration. Read-only development inspection found all expected tables/columns and denied direct-client grants on all 14 application tables, but history contains only 0001_init and the schema has foreign-key/index-name differences plus two missing indexes. No development DDL/history changes were made. See [development reconciliation](DEVELOPMENT_SCHEMA_RECONCILIATION.md). The privileged backend role still bypasses RLS; least privilege and unreviewed paths remain release work.
- Real provider enrollment, staff assurance enforcement, operator-assisted lost-device re-enrollment and global session revocation across two sessions are verified in staging. The API now validates provider sessions, bans/deletions and verified-factor presence. Browser revoked-session/recovery UX, recovery identity policy and remaining provider settings still need review. See [MFA recovery](MFA_RECOVERY.md).
- Payments/reversals/approvals and approval failure rollback are verified on PostgreSQL. A controlled customer reassignment/payment race now commits reassignment without deadlock, denies the old-agent payment and preserves totals; original retry acknowledgement and inactive-updater denial also passed. Customer updates recheck current actor permissions, and named financial workflows lock customer before loan. Broaden review to other assignment/branch races, job/approval lock interactions, scheduled fees and full historical reconciliation. See [assignment race verification](ASSIGNMENT_RACE_VERIFICATION.md).
- Staff creation failure compensation, active administrator rechecks, push destination/ownership validation and SMS recipient scope are implemented and verified with synthetic staging records. Staff updates/removal now recheck current actor permissions under ordered locks; controlled deactivation/demotion races deny pending writes, and reciprocal administrator edits commit without deadlock. Staff directory reads also resolve current active role/branch under actor locks; overlapping deactivation/demotion and branch moves are verified. Unlinked provisioning-marked identities now fail onboarding; scheduled metadata-only detection and the controlled recovery procedure are verified. Complete review of other services and actor/assignment races, an independent durable provisioning journal, privileged linking outside the cleanup protocol, branch lifecycle rules, live invitation/browser push behavior and storage permissions. Customer portal grants/revocation now recheck current actor/branch permissions, compensate failed creation and preserve disabled identity links; live concurrent grants and revoked-session denial passed. See [customer portal provisioning](CUSTOMER_PORTAL_PROVISIONING.md). See [provisioning recovery](PROVISIONING_RECOVERY.md). See [staff and notification verification](STAFF_NOTIFICATION_VERIFICATION.md), [staff mutation verification](STAFF_MUTATION_VERIFICATION.md) and [staff read verification](STAFF_READ_VERIFICATION.md).
- Review historical/inactive-staff cash reconciliation, report date/group filters and business definitions, historical branch attribution, and agreement validation for the proposed proportional partial-payment/no-invented-penalty closure policy.
- Execute coordinated Git history cleanup and review retained copies. Development database/API credential revocations and current test ID encryption remediation are independently verified; remote secret stores and backups remain unverified. Confirm audit coverage, retention/archive requirements and remaining dependency advisories.
- Verify actual offline cold start/recovery and production service-worker upgrade/account isolation against the real staging API.

Latest access completion: organization onboarding now locks/rechecks the provider identity, verifies administrator email, rejects existing/unfinished links and excludes stored MFA secrets; organization/branch operations recheck current role under actor locks. Serialized opt-in provisioning cleanup is implemented and tested; its deployment flag remains disabled, and an independent workflow journal/privileged linking review remain open. Document API operations enforce current entity scope and validate actual uploaded object metadata. Direct collection-photo uploads/public URLs, storage content controls and remaining assignment races are still release blockers. See [organization access](ORGANIZATION_ACCESS_VERIFICATION.md), [document access](DOCUMENT_ACCESS_VERIFICATION.md), [provisioning recovery](PROVISIONING_RECOVERY.md) and [release checkpoint](RELEASE_CHECKPOINT.md).

Error handling completion: the global filter no longer returns raw database diagnostics or arbitrary exception bodies and logs safe status categories. Payment/loan email and scheduled-job failure logs omit raw errors. Eleven focused confidentiality/status cases and the complete 335-test backend suite passed; build and focused lint passed. Development configuration parsing also suppresses malformed secret-bearing URL inputs. The working-file scanner passed on 422 files. See [error boundary verification](ERROR_BOUNDARY_VERIFICATION.md).

No production deployment/migration or real financial transaction has been performed. The latest development encryption-key rotation is recorded above; provider credential changes reported by the owner are distinguished from independently verified results. Live MFA enrollment used only a synthetic staging account that was removed. Changes remain uncommitted in the existing workspace.

## Batch 1: customer statements and durable collection submission

Scope: restrict portal statement generation to the authenticated customer's loan; replace the no-op offline save; use a shared, account-owned outbox for both collection screens; keep entries until a matching server acknowledgement; preserve photo evidence and collection IDs through retries.

### Threat and failure analysis before implementation

1. **Access:** the portal requires an active customer session; the statement query must include organization and customer IDs. Collection submission requires a resolved staff account permitted to record collections.
2. **Modification:** the outbox stores the original authenticated user, staff, and organization. Another account cannot list or sync those entries. Existing unowned entries must be retained for explicit recovery rather than guessed or discarded.
3. **Forged requests:** ownership comes from the server-resolved user, never a caller-supplied customer query parameter. Sync uses bearer auth and checks that the active auth identity matches the queued owner.
4. **Malicious clients:** server authorization remains authoritative. Client queue safeguards do not replace backend assignment checks, which remain a separate stabilization item.
5. **Direct database access:** use the existing tenant transaction plus an explicit customer filter for the PDF query. Live RLS/role verification remains outstanding.
6. **Secrets/data:** do not display credential values. Do not add tokens to persistent queue records. Preserve photographs on upload failure; broader storage privacy and credential rotation remain outstanding.
7. **Expired/switched authentication:** keep entries pending; do not send through a different account. Scope the auth-profile query by Supabase user ID so an old profile cannot be paired with a new session.
8. **Concurrent requests:** persist one stable collection ID first, prevent repeated UI submissions while saving/GPS is running, serialize same-account sync within one page, and reuse server idempotency on retries. Cross-tab behavior must be tested; server transaction/idempotency hardening remains outstanding.
9. **External failures:** storage failure is an error before success is shown; network/API/photo failures retain the entry. A generic HTTP 409 is not proof of successful duplicate recording. Delete only after validating the returned collection identity and financial fields.

### Validation plan

- Backend regression tests: own loan, another customer, another organization, missing loan, and portal forwarding of authenticated ownership.
- Frontend queue tests with IndexedDB simulation: commit failure, persistence/reload, account isolation, legacy retention, failed photo upload, failed API request, generic conflict, mismatched acknowledgement, successful retry, and concurrent sync.
- Both production builds, existing backend tests, frontend lint, and focused backend lint.
- Document verification results and remaining production limitations after implementation.

This batch does not establish production readiness or complete the broader project review backlog.

### Implemented

- Portal PDF queries include the authenticated customer and organization. Staff PDF callers retain their existing organization scope.
- Both collection screens use one durable IndexedDB outbox. Local storage must commit before the app reports a saved payment. Requests retain their original operation ID through retry.
- Queue entries belong to the original authenticated user, staff member, and organization. Sync checks the active session and server-resolved staff profile; the API interceptor blocks requests if the authenticated identity changes.
- An IndexedDB transaction prevents a second pending payment for the same loan and owner, including competing page instances. Sync is serialized within a page and uses Web Locks across tabs where supported.
- Photo evidence stays with the pending payment. Failed uploads stop submission; successful upload URLs are saved and reused on retry.
- Only a matching created/duplicate server acknowledgement removes a payment. Generic conflicts, rejection, unknown responses, and mismatched payment details remain pending with an error.
- The daily screen shows pending amounts and sync errors. Receipts use acknowledged server IDs, receipt numbers, and amounts; they no longer present today's due amount as the full outstanding balance.
- Auth profile caching is scoped to the authenticated user. Regression tests now run in both CI workflows.

### Verified locally

- **Backend:** all 18 tests across 5 suites pass, including 8 statement access regressions. Production build passes. Focused lint on the four changed/new backend files reports no errors and one pre-existing PDF stream typing warning.
- **Frontend:** all 31 tests across 2 suites pass. These use simulated IndexedDB and mocked API/storage responses. Coverage includes reload persistence, storage failure, cent precision, account isolation, legacy retention, rejected/mismatched acknowledgements, lost-acknowledgement retry, photo failure/reuse, overlapping sync, and competing saves from separate module instances.
- **Frontend production build:** passes. Existing large bundle and Vite configuration warnings remain.
- **Frontend lint:** passes with 6 existing warnings elsewhere in the project.
- **Browser:** checked the actual collection screen components with synthetic identities and a mocked server on a separate localhost origin. Confirmed offline save, persistence after reload, duplicate submission disabled, account isolation, pending visibility, successful sync, server rejection retained, retry success, and an acknowledged receipt displaying `RCP-SYNTHETIC`, the payment amount, and `See loan details` for an unavailable balance. No real customers, storage uploads, location, messages, or live database requests were used.
- Browser evidence: `collection-pending-check.jpg` and `collection-receipt-check.jpg`. The fixture replaces authentication/API/storage modules only under `test-browser/vite.config.ts`; production configuration does not load those mocks. Run `npm exec vite -- --config test-browser/vite.config.ts` from `pigmie-web`, then visit `/test-browser/index.html`. Fixture server state resets on reload while the browser outbox persists; it is not a substitute for backend integration tests.
- **Dependency audit:** npm reports 4 high-severity affected packages: axios, brace-expansion, fast-uri, and source-map-js. Their affected root versions were already present in the original lockfile; dependency remediation remains open. No automatic dependency upgrade was applied.

### Remaining limits and next work

1. Live database authorization/RLS, collection-photo bucket policies (including retry uploads), and real API/database integration have not been verified. This batch changes no schema or live data.
2. Offline collections survive page reload, but full offline startup, persistent loan/customer data, account-scoped service-worker caching, and browser storage eviction protection are not complete. Clearing browser data can still remove local entries.
3. Older queue entries lack ownership. They are preserved and flagged for administrator recovery; an audited recovery workflow is still needed.
4. Device safeguards cannot prevent the same physical payment being entered on different devices under different operation IDs. Backend assignment checks, transactional retry/idempotency behavior, and financial reconciliation remain open.
5. The broader review's MFA, staff/branch authorization, credential handling, loan math, scheduled fees, migrations, audit logging, and reporting findings remain unresolved. Prioritize server authentication and authorization next; these remain release blockers.

Changes are local and uncommitted. No deployment, credential rotation, live migration, or production financial operation was performed.

## Batch 2: authentication validation and record access (implemented locally; migration validation pending)

### Threat and failure analysis

1. Access requires a verified Supabase bearer token with an authenticated role and nonempty subject. Existing disabled staff/customers must be denied rather than treated as newly unprovisioned accounts.
2. Customer, loan, and collection detail actions require organization plus agent assignment or manager branch scope. Loan creation checks its customer; collection recording and batch sync check their loans.
3. Record IDs and batch structures from forged requests are validated before access queries; ownership is resolved by server data, not body-supplied organization or role.
4. Client routing is not authorization. The API enforces these boundaries, including statement/passbook/receipt downloads and administrative mutations.
5. Access lookups use the existing tenant transaction. Live RLS and reassignment races between access lookup and mutation remain separate integration concerns.
6. OTP secrets are never logged or returned after enrollment. Typed Prisma fields replace raw secret queries. Existing credentials are not changed.
7. Expired/invalid tokens, disabled accounts, and invalid OTPs fail closed. Full MFA enforcement and provider consolidation remain open because the current UI has both Supabase and custom TOTP flows.
8. Concurrent 2FA setup/enable/disable needs conditional updates to avoid replacing enabled secrets or clearing a newly changed secret. OTP validation must await the library's structured result and inspect its valid flag.
9. Token verification/database/library errors must not result in access or a successful OTP response. No live external authentication mutations are used in verification.

### Implemented

- Await custom TOTP verification and inspect `result.valid`; invalid codes cannot enable/disable the factor, and verification returns an actual boolean. DTOs require six numeric digits. Setup has a 3-per-minute limit; enable, verify, and disable have 5-per-minute limits through the existing throttler.
- All custom TOTP operations check organization and active staff. Administrator overrides verify the actor's active administrator role. Conditional updates prevent successful responses after a secret/state race, and disabling clears the flag and secret in one update.
- New ciphertext is stored as versioned base64 text. Legacy PostgreSQL `\\x` hex ciphertext is supported; unrecognized/corrupt values fail closed.
- Removed a newly discovered secret disclosure: settings previously requested QR images from `api.qrserver.com` with the authenticator secret in the URL. The backend now generates a PNG data URL using its existing qrcode dependency; settings validates and displays that local image. Older backend responses still support manual secret entry without contacting an external QR provider. Existing enrollments were not rotated.
- Authentication rejects invalid subjects/non-authenticated token roles, disabled staff, inactive customers, and customers whose portal access is disabled. These accounts cannot fall through to unprovisioned onboarding. Genuinely new identities still reach explicitly authorized onboarding endpoints. Any-role routes now require an authenticated identity.
- Shared record access checks cover customer, loan, and collection controllers, including detail reads, statements/passbooks/receipts, existing-record writes, loan creation against a customer, payment recording, and every distinct loan in batch sync. Organization, agent assignment, and manager branch are resolved from server data. Managers without a branch fail closed, including list routes.
- Accountants can read daily dues consistently with the web route; payment mutation roles remain restricted.
- An exact retry of an original recorded payment can recover its acknowledgement after loan reassignment. This exception requires the original operation ID, organization, collector, loan, amount, date, and method to match. It does not allow a new payment on an inaccessible loan.
- Customer creation defaults agents to their own assignment/branch and managers to their own branch. Agents cannot reassign or move existing customers. Selected branches and active agents must belong to the organization and the selected branch. Bulk/import paths also validate assignments. Ordinary contact updates do not fail simply because an unchanged historical assignment became inactive. Reassignment now keeps pending-approval loans consistent with approved/active loans.
- KYC summary queries follow agent/branch scope, and KYC status writes reject unsupported values before database mutation.
- Prepared `0002_staff_totp_secret/migration.sql`: adds the model's missing text column; preserves an existing text column; converts legacy bytea ciphertext to supported hex text; refuses unrecognized column types. It changes no enabled flags. The Prisma client was regenerated locally; the migration was not executed.

### Verification (2026-10-11)

- **Backend:** all 102 tests in 11 suites pass. This includes the original regressions plus 84 new authentication, role, record-scope, HTTP routing, customer assignment, and retry cases.
- **HTTP checks:** 12 tests run against a local Nest application using the actual controllers/guards and a mocked database. They confirm inaccessible requests stop before handlers, legitimate assigned access/payment recording works, mixed-access batches cannot post any payment, and accountants retain read access without mutation rights. Loopback access needed sandbox escalation; no remote service or real database was used.
- **Installed OTP library:** a separate local smoke check generated and verified a synthetic code and confirmed malformed input is rejected and results are structured. Setup tests generate a real PNG QR image with synthetic data.
- **Frontend:** all 31 existing collection tests still pass. Web production build and lint pass; 6 existing warnings remain. The settings QR change was type/build checked; no live authenticator was enrolled.
- **API production build:** passes after regenerating Prisma. Focused lint across 19 changed/new backend files has no errors and one pre-existing loan-close body typing warning. Full repository lint backlog remains open.
- **Database limitation:** neither PostgreSQL tools nor Docker are available in this workspace. The migration has only been reviewed locally, not executed against a disposable PostgreSQL database or your live database. Validate it against missing-column, text-column, and bytea-column cases before deployment, and apply compatible migrations before deploying the regenerated API client.

### Still open

1. **MFA is not fully resolved:** custom TOTP and Supabase MFA remain separate flows, and API assurance-level enforcement/provider consolidation is still a release blocker. Enrollment verification fixes alone do not establish a mandatory second factor on every protected request. Previously externalized custom TOTP enrollment secrets need a controlled re-enrollment plan.
2. **Broader access review:** staff, approvals, cash deposits, reporting/export endpoints, direct database policies, and service-worker account isolation still need review. The shared record guard protects the named controllers; it does not establish complete application-wide authorization.
3. **Race/integration limits:** the access guard and the eventual mutation use separate transactions. Permission or assignment changes between them still require transaction-level enforcement/locking. Full backend idempotency/financial reconciliation and live RLS remain unverified.
4. **Remaining review backlog:** financial schedule rounding/dates, pre-closure calculations, scheduled fee totals, audit capture/retention, schema drift beyond the TOTP column, exposed credentials, dependency advisories, dashboard/report accuracy, and offline cold-start/recovery remain open.

No deployment, live migration, credential rotation, customer messaging, or real payment operation was performed. All changes remain local and uncommitted.

## Batch 3 — financial correctness (in progress)

### Threat and failure analysis before implementation

1. Access: existing authenticated role/record guards continue to protect loan workflows; overdue processing is a server-only job.
2. Modification: calculations affect newly generated schedules; the job must explicitly scope every loan to its organization. Existing historical balances are not rewritten.
3. Forgery: dates, monetary precision, rates, and installment counts are validated on the server, including calls outside DTO validation.
4. Malicious input: reject non-finite values, negative rates, invalid calendar dates, unsupported frequencies, and fractional installment counts; never persist negative installments.
5. Direct database access: tenant transactions plus explicit predicates remain necessary; live RLS and historical reconciliation require separate verification.
6. Secrets: calculations and tests use synthetic values and do not require credentials or external services.
7. Expiry: existing authentication applies to requests; jobs use internal database access and cannot be invoked by an expired client token.
8. Concurrency: use the same loan-row lock as collection posting; re-read schedules after acquiring the lock. Fee, status, loan aggregates, and the durable audit marker must commit or roll back together. Payment/reversal status changes must not allow another fee.
9. External failure: a failed transaction is retryable without a partial charge; one failing loan must not prevent processing other loans. No notifications are sent by these corrections.

The user delegated the early-closure policy choice. The local correction uses proportional payment allocation and no invented product penalty. This policy must be confirmed against existing loan agreements before release; historical payments are not rewritten.

Audit capture will also be registered globally. Only action/actor/entity/outcome metadata may be recorded: setup secrets, bearer tokens, personal data, request bodies and response bodies must never be copied into generic audit records. Audit-write failure after a committed mutation must be caught, logged and must not tell a client that a saved payment failed. Critical fee and settlement evidence stays inside the financial transaction. Guard-denied requests and full before/after snapshots remain separate audit requirements.

### Implemented locally

- Repayment generation validates terms, works in decimal/cents, conserves principal, prevents negative last installments, supports zero interest, and clamps monthly dates to the original day or the destination month's final day.
- Web estimates match the server calculation in regression tests. Mixed duration conversions explicitly describe their approximation.
- Early-closure quotes include partial payments, proportional unpaid components, earned calendar-period interest and unpaid fees. No unsupported 2% penalty is invented. Settlement recalculates the quote under the loan lock, rejects stale/excessive amounts, waives partial rows too, and reconciles total payable/collected/outstanding together with a transactional audit event.
- Regular reversal refuses settled/waived loans until an explicit settlement adjustment can reconcile them. Restructuring rejects paid/waived/fee-bearing rows rather than silently losing existing money or charges.
- Loan and collection mutations lock and re-read the active staff role, loan and customer branch inside the mutation transaction. Duplicate payment lookup is scoped to the original owner and financial fields; foreign identifier collisions fail closed. Confirmation mail is sent only after payment commit.
- The registered overdue job uses the Indian calendar date and a loan lock, updates schedule/loan totals/audit evidence together, preserves legacy fee evidence, survives payment/reversal status changes without another charge, and rolls back on failure. The alternate implementation is now a compatibility export of the active job. Audit evidence is batch-read and parent totals updated once per loan; jobs have an explicit 60-second transaction limit.
- Generic audit capture is registered globally and records metadata without copying secrets/PII/response bodies. Audit failures are awaited and caught; a committed operation still returns success. Automatic audit deletion is disabled pending a verified archival/retention policy.
- The tracked `envs.txt` now contains safe configuration instructions. Ignored runtime `.env` files were not changed. Git history and previously disclosed credentials still require provider-side remediation; no credentials were rotated.

### Verification so far

Both production builds pass. Full API suite passed with 172 tests in 16 suites; the later transaction-limit regression passed separately. Web suite passes with 43 tests in 3 files, including backend/frontend parity across interest types and frequencies. Focused checks use mocked transactional state; they do not establish real PostgreSQL locking, triggers, RLS, historical reconciliation or migration safety. Frontend lint retains its 6 existing warnings. Final totals will be updated after subsequent checks.

## Batch 4 — unified staff MFA (in progress)

### Threat and failure analysis before implementation

1. Access: every provisioned staff account must have a signed Supabase `aal2` token on protected APIs; first-factor access is limited to explicit identity/bootstrap routes.
2. Modification: profile bootstrap cannot authorize business operations. Roles and tenant scope still come from the database, not client factor state.
3. Forgery: only a JWT verified with the provider's signing keys can supply assurance. Query strings, headers claiming MFA and custom OTP responses cannot grant assurance.
4. Malicious client: API enforcement must work even when the web route gate is bypassed. A missing or unknown assurance value fails closed for staff.
5. Direct database: API assurance does not establish live RLS protection; direct database policies and provider configuration remain release checks.
6. Secrets: enrollment QR/secret comes from Supabase and stays in the enrollment UI; old custom enrollment endpoints are retired. Generic audit never records enrollment payloads.
7. Expiry: expired tokens remain rejected. Supabase factor revocation and JWT refresh/revocation windows require provider validation; local signature verification cannot prove immediate remote session revocation.
8. Concurrency: account/session changes must discard old factor/enrollment results. Avoid duplicate enrollment on mount/re-render and prevent concurrent verification submissions.
9. External failure: factor/assurance lookup errors must keep the protected UI closed and allow retry/sign-out; no collection autosync before verified staff assurance.

Authenticated API responses must not be served from a URL-only service-worker/browser cache, which could otherwise return the previous account's data or bypass a new MFA challenge. Remove those runtime caches, purge the known legacy caches on activation, and clear in-memory queries at an account transition before mounting protected pages. Durable collection outbox storage remains separate and is preserved. The generated PWA worker must own push handling too; notifications should contain only a generic prompt, and notification clicks must remain on the application's origin.

The policy is mandatory MFA for staff, with customer portal behavior unchanged. Existing custom-only enrollments need a Supabase enrollment before business access. Deploy the matching web/API together and validate enrollment, password/OAuth login, refresh, recovery and factor revocation in a controlled provider environment before release. Reference: [Supabase MFA and assurance documentation](https://supabase.com/docs/guides/auth/auth-mfa).

### Notification ownership review before implementation

1. Only authenticated staff with verified MFA can access the current notification routes.
2. A recipient may mark only their own notification read, including within the same organization; enforce this in the update predicate.
3. Forged notification IDs must reveal no record and cause no mutation.
4. Client recipient IDs cannot select another owner; use the authenticated identity.
5. Explicit tenant and recipient predicates complement, but do not verify, live database policies.
6. Generic push payloads must contain no borrower or balance details; provider errors must not log endpoint secrets.
7. Expired authentication remains denied by the shared guard.
8. A single conditional update avoids an ownership-check/write race; repeated owned reads remain idempotent.
9. Push failures must not undo the saved in-app notification; tests mock delivery and never send real messages.

## Batch 5 — staff data disclosure and branch boundaries

### Threat analysis before implementation

1. Staff administration routes require authenticated staff and the controller's existing role restrictions.
2. Branch managers may read their own branch only; a missing branch must deny access. Public staff responses must explicitly exclude stored authenticator secrets.
3. Forged staff/branch identifiers must fail explicit organization checks.
4. Selected branches must exist in the organization before staff creation/update; an active branch manager needs a branch.
5. Explicit predicates and safe field selection supplement unverified live RLS.
6. Return only public staff fields; no encrypted secret or authentication enrollment material from reads or mutations.
7. The shared authentication guard rejects inactive/expired callers; transaction-level actor races in staff administration still require broader enforcement.
8. Public selection protects responses independently of concurrent secret enrollment. Branch changes must validate against the target organization.
9. Validate branch inputs before creating provider users. Provider invitation failure/compensation remains an operational workflow gap; no live users are created in tests.

## Batch 6 — report identity and tenant boundaries

### Threat analysis before implementation

1. Report routes retain existing staff role restrictions and mandatory MFA.
2. Reports must use the staff record ID, not mistake it for the provider auth ID. Agents see their assigned loan portfolio; managers see their current branch.
3. Caller-supplied branch filters cannot broaden manager access; missing staff/branch records deny access.
4. Query DTO validation remains; server queries use typed scope and parameterized SQL.
5. Explicit organization predicates supplement unverified RLS and protect joined aggregates.
6. Financial dashboard debug logs are removed; exports continue to escape formula prefixes and quotes.
7. Resolve active staff again inside the report transaction; authentication expiry is handled by the guard.
8. Read reports do not modify money; a later assignment change can affect the next report. Real database snapshot behavior remains unverified.
9. Query failure returns an error instead of invented data. SQL field changes follow the Prisma mapping; tests inspect generated scope and use synthetic aggregates.

## Batch 7 — cash deposit access and concurrent verification

### Threat analysis before implementation

1. Existing controller roles and mandatory staff MFA remain; service operations resolve active staff again.
2. Agents read their deposits only; managers read/verify deposits from their current branch only. Reconciliation agents are branch-scoped.
3. Forged agent filters or deposit IDs cannot broaden the authenticated scope.
4. Query dates/status/IDs and deposit amounts require validation; service mutation checks reject unsupported status and invalid money.
5. Explicit tenant predicates supplement unverified RLS; SQL locks require real PostgreSQL verification.
6. Tests use synthetic deposits and never post financial records or messages to a real service.
7. Missing/inactive actors and managers without branches fail closed.
8. Verification locks the actor, deposit and deposit owner, then conditionally changes a pending record; two reviewers cannot overwrite one another.
9. Failure rolls back the deposit transaction. Reconciliation remains a read-only comparison of recorded/verified cash collections and verified deposits; real balances require separate reconciliation.

## Batch 8 — dependency audit and compatible patches

Before implementation: dependencies affect all authenticated routes and build tooling; upgrades must preserve existing framework/client major versions, authorization, financial calculations and failure handling. Registry advisories and lockfile changes use no credentials. Compatible dependency updates are verified with builds/tests; do not apply the audit's suggested Prisma major downgrade. Database tooling advisories and upload dependency compatibility remain explicit blockers when no compatible update is proven. All nine threat dimensions from earlier batches remain applicable; updates must not change tenant boundaries, secrets, expiry, transaction behavior or external-failure handling.

Initial production registry audit: API 9 findings (1 critical, 7 high, 1 moderate), web 2 high. Audit JSON files contain package/advisory metadata only. The critical API issue is transitive proxy-addr. Prefer compatible patch/minor updates without forced major upgrades.

## Batch 9 — approval scope and atomic execution (plan before edits)

1. Access: existing approval roles/MFA remain; resolve active staff within the transaction and deny branchless managers.
2. Modification: agents see their own submissions; managers see branch submissions and can act only on current branch entities; admins retain organization scope. The action determines the entity type.
3. Forgery: entity IDs must resolve in the same organization and actor scope; review cannot trust a submitted branch or entity label.
4. Malicious client: validate payload again against the actual close/restructure DTO before action execution; unknown actions fail closed. Typed query pagination/status cannot bypass scope.
5. Database: explicit predicates supplement unverified RLS. No schema change is required; nested financial service calls must use the approval's transaction, with cross-tenant nesting rejected.
6. Secrets: approval payloads never become generic audit bodies; mocks contain synthetic data only.
7. Expiry: shared authentication handles expired tokens; review rechecks current active role under a staff row lock.
8. Concurrency: lock the approval request and relevant entity; execute the action and reviewed status in one transaction. A second reviewer sees the final status and cannot execute twice. Atomic nesting is opt-in for this workflow so ordinary transactions keep existing behavior.
9. Failure: a failed action or status update rolls back both; these action paths do not send external notifications. Database deadlocks/timeouts remain retryable errors and require real PostgreSQL validation.

## Batch 10 — report display/export contracts (plan before edits)

1. Existing authenticated report roles/MFA apply; show administrator-only export/comparison controls only to administrators, and align accountant report reads with the existing web role.
2. Preserve actor/branch scope in report data and exports; no client-supplied identity may broaden a report.
3. Unsupported export types fail explicitly; CSV formula prefixes and quotes are escaped.
4. Parse actual aggregate response fields; risk percentages must not be silently converted into an empty overdue-loan table, and agent totals must not be displayed as daily figures.
5. Explicit tenant predicates and field selection supplement unverified RLS; export schedules scope through the parent loan.
6. Overdue reports/export select only required fields and exclude stored identity-proof ciphertext; report errors must not fabricate zero balances.
7. Recheck active export actor/current administrator role within the export transaction.
8. Reports remain read-only; exports use the same service calculations as displayed aggregate data. No historical financial rows are changed.
9. API/parse failures display an error with retry. Tests use synthetic response contracts and CSV content; no messages, payments or external files are published.

## Batch 11 — isolated staging setup (plan before edits)

1. Only an authorized project operator can launch staging; hosted ownership must be supplied by the user.
2. Separate Supabase project, database, authentication users, encryption key and synthetic records; no production copy.
3. Launcher rejects mismatched project URLs/database identities and the current runtime project.
4. Explicit file and command selection; no shell interpolation, arbitrary commands or automatic migration application.
5. Migration status is read-only; deployment requires schema/RLS review and a verified empty staging database.
6. Staging files are ignored, environment values never printed, and application email/SMS/push delivery is disabled.
7. Staging authentication uses its own provider; mandatory staff MFA remains enabled.
8. Staging does not share production financial locks/rows; real concurrency checks follow provisioning.
9. Missing/invalid configuration stops before process launch. No fallback to the runtime .env or inherited integration credentials.

## Batch 12 — migration history alignment (plan before edits)

1. Migration files are prepared locally; remote deployment is limited to the confirmed new staging project after connection verification.
2. Add missing KYC metadata, approval enums/table and push subscriptions; preserve financial records and existing migration history.
3. No caller-provided identifiers enter DDL. Client Data API roles must not write around API MFA/role/financial checks.
4. Strict creation fails on pre-existing untracked tables; require explicit drift reconciliation rather than guessing a destructive conversion.
5. New tables have RLS enabled and no client policies; revoke Data API access to application tables. Backend authorization remains required and the privileged runtime role remains a least-privilege review item.
6. No credential values appear in migrations or reference SQL. The generated full schema is a reference only and lacks security/triggers.
7. Database denial prevents direct authenticated/anonymous client access independent of token expiry; API staff MFA remains enforced.
8. Transactional migrations roll back on an error; do not drop financial triggers or rewrite historical totals.
9. Connection/schema failures stop deployment. Verify Prisma drift, actual role privileges, rollback, missing/text/bytea migration paths and concurrent financial behavior in PostgreSQL before release.

### Current staging checkpoint

Hosted creation was verified healthy: `sjelnxrlkrvwjcgqbvre` in Mumbai. Staging API keys and a new encryption key are stored only in ignored `.env.staging`; database password placeholders remain. `configure-staging.ps1` was prepared and syntax-checked to accept the saved password through a hidden prompt and URL-encode both connection URLs. Password entry is the next user step; no database connection or migration has been performed. Additive migration `0003_align_application_schema` is drafted for missing KYC/approval/push objects and direct Data API privilege removal, but remains unapplied and needs real PostgreSQL verification. The full generated schema in `docs/STAGING_EXPECTED_SCHEMA.sql` is reference-only, not a bootstrap script.

### Verified schema drift plan

The first three migrations deployed successfully to the verified new staging project. Prisma's read-only diff shows two missing composite indexes, historical index-name differences, and historical foreign keys using ON UPDATE NO ACTION while Prisma defaults to CASCADE. Preserve the established database behavior by explicitly mapping historical indexes and specifying NoAction in the model for pre-existing relations; do not drop/rebuild financial foreign keys just to adopt a default. Add the two missing indexes with an additive migration, then verify an empty Prisma diff. Authorization, delete behavior, financial triggers and row data stay subject to the existing checks and policy.

### Live provider MFA check plan

Use one short-lived synthetic staging auth account, created with email already confirmed so no invitation/confirmation email is sent, linked to a synthetic organization/staff row. Verify the actual API denies its first-factor token, allows the designated bootstrap profile route, accepts a Supabase-issued second-factor token after TOTP verification, and denies that token after staff deactivation. Passwords, TOTP secrets, access/refresh tokens and provider keys remain transient and are never printed or written to test fixtures. Browser recovery/enrollment UX and lost-device procedures remain separate release checks. Remove only the exact synthetic auth user/staff/organization created by this check, including on failure; do not touch existing accounts. Provider/network failures stop the check and report only the checkpoint, with no invented success. The existing nine-dimension staging analysis applies to identity, scope, forged clients, direct grants, expiry and concurrency.
