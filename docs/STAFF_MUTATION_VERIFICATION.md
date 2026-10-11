# Staff mutation verification — 2026-10-11

## Threat and failure analysis before implementation

1. Access: existing provider session/MFA and role guards apply. Reload the active actor inside the mutation transaction; stale administrator status must not authorize a write.
2. Modification: active organization administrators retain general staff edits and soft removal. Other permitted staff roles may change only their own phone. Actor and target must belong to the same organization.
3. Forgery: actor identity comes from the authenticated request, never its body. Missing/foreign targets must not expose staff data or change another organization.
4. Malicious input: retain validated update DTOs and branch checks, and enforce the allowed self-service fields again in the service.
5. Direct database access: explicit tenant predicates and row locks supplement staging client privilege denial. The privileged backend role and direct operator changes remain separate limits.
6. Secrets: return only public staff fields; no provider credentials, authenticator secrets or raw environment values enter fixtures/logs.
7. Expiry: the existing authentication guard validates provider sessions. Inactive actors fail again at mutation time; deactivation preserves existing financial records and makes future API authentication fail.
8. Concurrency: lock actor and target staff rows in ID order before reading current state. Reciprocal edits use the same order, and concurrent deactivation/demotion must complete before the waiting request rechecks permissions.
9. External failure: this batch changes database staff state only, with rollback on failure. It neither deletes provider accounts nor claims global provider session revocation; recovery/reconciliation remains separate work.

## Verification results

Implemented the service-level permission check for all staff updates and soft removal. The controller passes the authenticated actor ID and delegates the decision to current database state. Actor and target rows are locked in ID order before the actor is reloaded. The own-phone helper uses the same transaction path, including empty-patch and inactive-account checks. Existing branch validation and public-field selection are preserved.

- Focused staff regressions passed: 21 tests. Coverage includes inactive/foreign actors, demotion, forbidden self-promotion, legitimate own-phone changes, missing organization-owned targets and soft removal without provider deletion.
- Full backend regression suite passed: 272 tests in 23 suites. Production build and focused lint for the three changed staff files passed. The final working-file secret scan and diff whitespace checks passed.
- The actual staging provisioning script passed all earlier provider/push/SMS checks plus controlled staff races. PostgreSQL lock-wait metadata confirmed the permission-change transaction and waiting mutation actually overlapped before releasing the lock.
- Actor deactivation blocked a pending general edit; administrator demotion blocked a pending soft removal. Target name/active state were unchanged. Reciprocal administrator phone edits committed without deadlock.
- Active own-phone edits passed; self-promotion, inactive own-phone edits and inactive empty patches failed. All synthetic organization records and provider accounts were removed. No messages, production writes or credential output occurred.

## Limits

This verifies the named staff write paths and overlapping cases, not every lock interaction in the application. Existing self-demotion/self-removal behavior is preserved; a policy preventing loss of the last administrator remains a separate product decision. Deactivation denies subsequent API access through the existing guard but does not globally sign the user out of Supabase or remove browser push subscriptions. Directory read permissions and named races are now verified in [staff read verification](STAFF_READ_VERIFICATION.md). Provider crash reconciliation, live invitation behavior, storage authorization and other services still need broader review. No migration or production deployment was performed.
