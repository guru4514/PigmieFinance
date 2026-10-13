# Release checkpoint — 2026-10-14

The application is not yet approved for release. Continue web stabilization before starting the agent mobile app; desktop wrapping remains optional.

## Runtime isolation — latest verified increment

Final checks: backend/web builds and focused lint passed, retaining five existing web warnings. All 18 secret/staging-configuration tests passed; source and Git-index credential scans are required for the local checkpoint. Actual staging loan-product actor/permission/bounds races passed with synthetic cleanup verified.

Migration 0009 is applied in development and staging with all nine checksums verified and original data/history preserved. The API requires a dedicated non-owner/non-BYPASSRLS login, verifies its attributes at startup, and scopes business access through tenant transactions. Identity/onboarding, provider session validation, scheduled jobs and provisioning recovery use narrow contexts/functions. Actual staging financial/provisioning integration and compiled API MFA HTTP flows passed; synthetic cleanup and server shutdown were verified. Compiled development startup passed read-only privilege verification. Browser organization-switch push recovery is bounded, checks the current account and exposes reconnect on failure.

Verification: **502 backend tests across 42 suites** and **83 web tests across 10 files** passed. Builds, focused lint and secret/configuration checks are recorded in the final runtime checkpoint. See [runtime rollout](RUNTIME_ROLLOUT_VERIFICATION.md) and [runtime policy](RUNTIME_RLS_VERIFICATION.md). The local staging launcher excludes operator credentials; existing hosted API deployments still need the runtime secret and verified build restart. Broader per-record authorization review, historical source evidence, remaining advisories, physical-device tests and independent off-site/key-escrow/hosted restore remain release work. Previous runtime-role/test-count paragraphs below are historical.

Latest [four-package execution](FOUR_PACKAGE_EXECUTION.md): all eight migrations are applied and match the model in development and staging; original rows/history were preserved. Migration 0008 removes all browser privileges on the fifteen application tables and prevents postgres/public future-table browser defaults. Immutable amendments, exact payment/settlement components, independent evidence reconstruction and corrected dashboard fulfillment/risk metrics are implemented. Compatible dependency patches remove the critical backend findings and clear the web audit. Runtime database least privilege, historical source reconciliation, remaining vendor/tooling advisories, physical devices and independent off-site/escrow/hosted recovery remain release gates. Local recovery evidence does not establish hosted Auth/ACL runtime restoration.

## Latest orchestrated integration — completed verification on 14 October

Separate financial-verification, operational-permissions and dependency tracks were integrated with the dashboard correction. Read-only inventory distinguishes 13 incomplete from 12 inconsistent historical development loans; none were repaired without source evidence. Known synthetic loan lifecycles, sequential amendments, earlier partial-payment reversals, settlement reconstruction, intentional drift detection and actual dashboard/PAR SQL passed in staging with fixture cleanup verified. The final independent review also required amendment totals to be anchored to the full evidence chain, rather than accepted merely because local before/after differences match.

Final integration verification: **478 backend tests across 40 suites**, build and focused lint passed. The web **75-test** suite, build and lint passed, retaining five existing warnings. Fourteen secret/configuration tests and source/index scans passed. Live staging financial reconstruction and dashboard/PAR checks passed; all synthetic fixtures were removed and the final staging inventory is empty. Both environments report current migration status and an empty Prisma schema difference. Counts from the previous batch below are historical. Reviewed local commits exclude all environments, keys, archives and generated output; no public push occurs.

The next dependent security package is replacing the operator/BYPASSRLS application connection with a dedicated runtime login and completing its policies/workflow separation. A bare role switch would break approved operations: approval/push policies and provisioning/background contexts need to be implemented and exercised with the real runtime login. Provider-owned supabase_admin defaults remain untouched and need separate review. Details: [operational gates](OPERATIONAL_GATE_VERIFICATION.md), [financial reconstruction](FINANCIAL_RECONSTRUCTION_VERIFICATION.md), [dashboard definitions](DASHBOARD_METRIC_VERIFICATION.md), [dependency verification](DEPENDENCY_VERIFICATION_2026-10-13.md).

## Previous 13 October verification

Backend **436 tests across 39 suites**, build and focused lint passed; web **75 tests across nine files**, build and lint passed with zero errors and five existing warnings. Fourteen secret-scanner/staging configuration tests passed. Live staging finance verified exact component reversals, immutable sequential amendments, component-bearing settlement receipts, rollback and concurrent approval/payment behavior. All synthetic fixtures and uploaded objects were removed with absence verified. Current source secret scan passed. The reviewed changes are saved as separate local financial, web-recovery and platform-recovery commits; environment files, archives, keys and generated output are excluded. No new public push is performed.

## Previous verified batch — 11 October

The [third stabilization pass](FOUR_PRIORITY_THIRD_PASS_2026-10-11.md) records newer evidence: retained development application restore, two applied development indexes, private evidence in both environments, closure consistency checks and temporary fee gates. Earlier test counts and storage/schema descriptions below are historical; the linked record describes remaining limits.

- Organization onboarding rejects forged email, ineligible provider identities and duplicate account linkage; concurrent staging submissions create one organization. Current administrator checks deny overlapping demotion.
- Document API checks current staff/entity scope before signing, listing, registering or deleting. Registration uses actual storage metadata. Private staging upload/download and unauthorized/inactive actor rejection passed.
- Provisioning recovery shares attempt locks with supported creators, rechecks links and deletes only eligible old marked identities. Two competing staging workers delete one synthetic orphan. Deployment cleanup remains opt-in and disabled by default.
- The global error boundary now omits raw driver/provider diagnostics and arbitrary response details while preserving validation arrays and authentication statuses. Payment/loan email and scheduled-job logs omit raw errors. Eleven confidentiality/status regression tests passed. See [error boundary verification](ERROR_BOUNDARY_VERIFICATION.md).
- Backend: 335 tests in 28 suites; build and focused lint passed. Web: 62 tests in 7 files; build passed; five existing lint warnings and a bundle size warning remain.

All staging fixtures, uploaded objects, temporary fixture buckets and provider identities from the latest checks were removed. No production deployment or real financial operation was performed.

## Release work still open

1. Privileged backend least privilege, transaction-timeout reliability and remaining service/assignment races. The identified development schema/history baseline discrepancy is closed as recorded above.
2. Private collection evidence: new outbox uploads use scoped private grants and retain evidence for retry. Staging direct browser-role access is restricted and signed operations were verified. Historical public objects/URL-only queues, development storage controls, content inspection and real device recovery remain open. See the four-priority progress document for current evidence.
3. Real offline cold start, account switching, storage eviction/recovery and service-worker upgrade against staging.
4. MFA browser recovery/revocation experience and operator identity policy; invitation delivery safety; independent durable provisioning journal/audit and monitoring.
5. Scheduled fee/job concurrency, historical reconciliation, report business definitions, audit coverage/retention and closure policy validation.
6. Four high production dependency audit findings in Prisma's chain, build-tooling advisories, coordinated secret-bearing Git history cleanup, retained encrypted copies and remote secret-store verification.

Moving the Prisma CLI to development dependencies did not remove the audit findings because it remains reachable through the client's peer dependency. Installed package versions were unchanged across 950 compared entries; no forced downgrade or unsafe override was applied.

See STABILIZATION_PROGRESS.md and the linked verification records for evidence and limits. Passing the named cases does not establish complete application-wide authorization or release readiness.
