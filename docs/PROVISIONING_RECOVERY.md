# Provider provisioning recovery — 2026-10-11

## Threat and failure analysis

1. Access: provisioning-marked identities without a staff/customer link cannot become ordinary onboarding identities. Linked identities retain normal authentication/MFA checks.
2. Modification: the internal worker deletes only eligible provider identities; it never links accounts or retries invitations. The default is report-only.
3. Forgery: attempt/organization markers come from provider-owned app metadata, never client-editable metadata or request fields.
4. Malicious clients: onboarding independently rechecks the current provider identity and rejects unfinished marked identities.
5. Database access: eligibility excludes every staff/customer link, including inactive links. Direct privileged linking outside the application lock protocol is a rollout risk.
6. Secrets: queries select identifiers/timestamps only; scheduled logs contain counts or generic failures. No tokens, email addresses, credentials or provider error bodies are logged.
7. Expiry: provider session, ban, deletion and factor validation remain mandatory.
8. Concurrency: supported creators hold an attempt advisory transaction lock until commit/rollback. Cleanup takes the same lock without waiting and rechecks current age, exact marker and links before deletion. A report snapshot alone is insufficient authority.
9. External failure: failed deletion leaves provider metadata available for retry. Do not hold an auth.users row lock during provider deletion, which needs its own database connection. Provider calls and transactions are bounded.

## Operation

Every fifteen minutes, the worker checks marked identities older than fifteen minutes, capped at the oldest 100 candidates. Without `PROVISIONING_AUTO_CLEANUP=true`, it reports counts only. The flag has not been enabled in the checked development or staging configuration. There is no public cleanup endpoint.

Opt-in cleanup skips held attempt locks and candidates that became linked, changed markers or disappeared. It deletes only a still-eligible identity through the provider administrative API and reports inspected/deleted/skipped/failed counts. Staff and new customer portal account creation use the shared lock protocol. Organization onboarding rejects marked identities. Portal revocation retains its disabled link, and reactivation validates/reuses that identity; inactive links are never cleanup candidates.

Before enabling cleanup, prohibit direct privileged account linking outside this protocol and review additional linking integrations. For ambiguous historical identities, preserve them and investigate; email matches alone do not establish ownership. Manual cleanup requires pausing uncoordinated linking and rechecking all application links.

## Verification and limits

The full backend suite passed 324 tests in 27 suites. Four cleanup tests cover held locks, changed eligibility, exact deletion and generic failure handling. Live staging preserved fresh identities, linked staff and inactive customer links. A held attempt lock prevented deletion; after release, two competing workers deleted exactly one owned synthetic orphan without failures. Provider deletion was confirmed. All disposable identities and records were removed. Actual signed-in unlinked marked identities were denied onboarding.

Provider metadata survives application crashes, but this is not an independent SQL workflow journal or durable completion audit. Unmarked historical orphans remain outside detection. Invitation retry/delivery verification, monitoring and backlog management remain open. A cap of 100 requires resolving old candidates to expose later ones. Account creation and application writes still span separate provider/database transactions.

`node scripts/inspect-staging-provisioning.mjs` is a read-only metadata report on the fixed staging target. `node scripts/check-staging-provisioning.mjs` exercises explicit recovery with synthetic staging identities and removes its fixtures; it does not enable deployment cleanup.
