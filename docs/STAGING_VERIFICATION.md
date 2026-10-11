# Staging verification — 2026-10-11

Target: `sjelnxrlkrvwjcgqbvre` / `pigmie-finance-staging`, PigmieFinance organization, Mumbai, free plan. Current runtime project `yvxtkzxqaqkhyntdszcu` is excluded by the launcher.

## Verified on the actual provider/database

- Supabase CA certificate obtained from the official dashboard; trusted TLS connection succeeded. No certificate bypass was used. Credentials remain in ignored `.env.staging`; no password/key/token/OTP secret was printed.
- Initial database had no public tables. The three initial migrations passed a transactional dry-run and rollback, including missing/text/bytea TOTP-column compatibility and exact byte preservation.
- Four migrations deployed through Prisma. Historical index names and foreign-key update behavior are now explicit in the model. The final read-only Prisma schema comparison is empty. All application tables have RLS; direct client application-table privileges are revoked.
- Two simultaneous identical payment requests through the real collection service committed one receipt and returned one duplicate. Loan and schedule totals were 55 collected / 55 outstanding; a changed-amount retry was rejected.
- Two simultaneous reversals produced one reversal; loan and schedule totals returned to 0 collected / 110 outstanding.
- A partial-payment early closure went through the real approval service. A deliberately failed approval-status save rolled back settlement collection, loan changes and audit; the request remained pending. Two subsequent reviewers produced one settlement and one approved request. Recorded collection totals matched the closed loan's collected/payable totals; outstanding was zero.
- Actual `anon` and `authenticated` role queries could not read staff records.
- One short-lived provider account was created with email already confirmed, without invitation/confirmation delivery. Password-only token was denied on the staff API (403), permitted on the profile bootstrap route (200), and remained denied after provider TOTP enrollment. The provider-issued second-factor token was accepted (200); staff deactivation caused immediate API denial (401).
- Synthetic financial organizations/records and the provider MFA account were removed after checks. One fixture setup transaction hit Prisma's default timeout and rolled back; the fixture-only setup/cleanup timeout was increased to 30 seconds, then the checks passed. Production service timeouts were unchanged.
- API startup succeeded against staging. Health returned 200; staff/collection requests without authentication returned 401; responses carried `no-store, private`. The temporary server was stopped afterward.

Additional assignment-race verification: a controlled overlapping customer reassignment and old-agent payment completed without deadlock; reassignment committed, payment was denied and totals stayed unchanged. Exact original retry acknowledgement and disabled-updater denial passed. The existing payment/reversal/approval checks still passed after lock-order changes; fixtures were removed. See [assignment race verification](ASSIGNMENT_RACE_VERIFICATION.md).

## Repeatable checks

Customer portal checks: concurrent grants created one provider identity; a real customer session was accepted before revocation and denied afterward. Revocation retained the identity/link and reactivation reused it. Controlled actor deactivation blocked a pending revocation. Earlier integration checks passed and all disposable records/accounts were removed. See [customer portal provisioning](CUSTOMER_PORTAL_PROVISIONING.md).

Provisioning recovery checks: old marked/unlinked provider identities were detected; fresh and linked identities, including inactive customer links, were preserved. An actual provider session for an unlinked invitation identity was denied onboarding by the compiled guard. All prior synthetic service/race checks passed and cleanup completed. See [provisioning recovery](PROVISIONING_RECOVERY.md). `node scripts/inspect-staging-provisioning.mjs` provides the read-only metadata report on the fixed staging target; it does not delete identities.

Additional staff/notification verification: actual provider identity creation and database-failure compensation passed; push takeover rejection, matching-key browser transfer, owner-only unsubscribe, unsafe endpoint rejection and inactive-subscriber denial passed against actual services/database. Branch-manager SMS authorization rejected mixed-scope batches before delivery. No invitation, SMS or push was sent; synthetic records and provider accounts were removed. See [staff and notification verification](STAFF_NOTIFICATION_VERIFICATION.md).

Additional staff mutation verification: controlled actor deactivation/demotion overlapped pending edits/removal, confirmed through PostgreSQL lock waits; pending mutations were denied and target state preserved. Reciprocal administrator updates committed without deadlock. Active own-phone changes worked; inactive/empty patches and self-promotion failed. All disposable fixtures/provider accounts were removed. See [staff mutation verification](STAFF_MUTATION_VERIFICATION.md).

Additional staff directory verification: controlled deactivation/demotion denied waiting list/detail reads. A manager's concurrent branch move made the old-branch detail inaccessible; subsequent forged list filters could not broaden the new branch scope. Administrator directory access and public field selection were preserved. Earlier provisioning/notification/mutation checks also passed, and all fixtures/provider accounts were removed. See [staff read verification](STAFF_READ_VERIFICATION.md).

Additional recovery/session verification: global sign-out now denies tokens from two device sessions and rejects refresh. Lost-factor removal blocks stale staff access; operator revocation requires fresh sign-in/enrollment, and verified replacement restores access. Provider deletion denies the old token before onboarding. The initial signed-out-token HTTP 200 gap was fixed through provider session/factor validation. Build, 239 backend tests and focused lint passed; fixtures were removed. See [recovery procedure and limits](MFA_RECOVERY.md).

From `pigmie-api`, `node scripts/inspect-staging.mjs` inspects metadata. `node scripts/staging.mjs status` and `diff` check migration history/schema. `check-staging-finance.mjs` runs synthetic service integration and cleanup. `check-staging-mfa.mjs` requires the staging API running on port 3001 and creates/removes one synthetic provider account. Both scripts are hard-coded to this verified staging reference. Do not run them against production.

The empty-database and index deployment dry-run scripts require their documented pre-deployment state; they intentionally fail after deployment rather than replaying migrations.

`node scripts/check-staging-provisioning.mjs` verifies staff provider compensation, push ownership and SMS scope using disposable records on the same fixed staging target. It does not require a running API and suppresses external notification delivery.

## Limits

Latest organization/document/recovery verification: concurrent onboarding created one organization and returned one duplicate conflict; marked orphan onboarding and an overlapping administrator demotion were denied. Held provisioning attempt locks prevented deletion; after release, two workers deleted exactly one owned synthetic orphan, preserving fresh and linked identities. Private signed PDF upload, authoritative storage metadata and authorized download passed; unrelated/foreign-path/inactive actor requests failed. All exact fixture records/accounts/objects were removed, including the private bucket only when created by the check. Backend regression passed 324 tests in 27 suites. See [organization access](ORGANIZATION_ACCESS_VERIFICATION.md), [document access](DOCUMENT_ACCESS_VERIFICATION.md) and [recovery](PROVISIONING_RECOVERY.md).

These checks cover the named synthetic cases, not every branch/assignment race, fee job, historical balance, report query or recovery path. The backend uses a privileged database role that bypasses RLS; direct-client denial does not establish database isolation for every backend query. The documented operator-assisted recovery/global revocation cases are verified; recovery identity policy, browser MFA/revoked-session UX, live offline recovery, storage policies/buckets, provider mail safety and existing runtime schema still need review. Remaining access/dependency/credential/audit blockers are in `STABILIZATION_PROGRESS.md`. This staging verification does not authorize a production rollout.
