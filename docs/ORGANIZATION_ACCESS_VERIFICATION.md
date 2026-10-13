# Organization and branch access — 2026-10-11

## Threat analysis before implementation

1. Access: onboarding requires an active, confirmed provider identity; other reads/writes recheck active staff inside their transaction.
2. Scope: onboarding must not relink a staff/customer identity or unfinished provisioning account. Organization/branch writes require the current organization administrator role.
3. Forgery: derive/check administrator email against current provider data, not only a submitted email. Controller-supplied actor IDs come from authentication.
4. Malicious clients: preserve DTO validation; never return stored staff MFA secrets in onboarding responses.
5. Database: explicit tenant predicates and provider-row locking complement direct-client privilege denial; privileged backend isolation remains separate.
6. Secrets: query only provider identity status/email/marker fields; select public staff response fields. No credential values in fixtures/output.
7. Expiry: existing provider session/MFA guards remain; missing/banned/unconfirmed identities and inactive/demoted staff fail closed.
8. Concurrency: lock the provider identity before checking existing links inside the onboarding transaction; duplicate submissions serialize and leave one organization. Lock active branch targets before updates/deactivation.
9. Failure: all organization/head-office/staff creation rolls back together. Provider/database failures must not fabricate onboarding success. No mail/provider account deletion or production migration occurs.

## Results

All 16 focused tests passed. Live staging concurrent onboarding created exactly one organization; the competing request returned 409. An unlinked provisioning-marked identity was denied (403). Controlled administrator demotion denied the waiting organization update (403) and preserved the organization name. Synthetic identities and records were removed.

Onboarding responses exclude stored MFA secrets. New organizations default to INR and Asia/Kolkata, matching the schema. Organization and branch operations use the current staff role under a shared actor lock. Branch mutations additionally lock and scope their target.

The complete backend suite passed 324 tests in 27 suites, with a successful build and focused lint. Branch deactivation rules for existing assignments and every branch/assignment race still require review; these results do not establish complete organization lifecycle coverage.
