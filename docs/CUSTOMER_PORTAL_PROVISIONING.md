# Customer portal provisioning — 2026-10-11

## Threat analysis before implementation

1. Access: keep MFA/role guards, then reload active administrator/manager permissions in the mutation transaction.
2. Scope: organization administrators manage organization customers; managers only current branch customers. Actor ID comes from authentication.
3. Forgery: validate current organization/branch and never trust client role/branch values.
4. Malicious input: retain email DTO validation, reject inactive customers, and prevent relinking a retained identity under another email.
5. Database: lock actor for sharing then customer for update, matching existing customer edits; explicit tenant predicates remain necessary under the privileged backend role.
6. Secrets: generic provider errors, bounded timeouts, no raw provider logs, public portal response fields only, no staging invitation delivery.
7. Expiry/revocation: disabling portal access retains its identity link so the guard denies access instead of reclassifying the account as unprovisioned.
8. Concurrency: serialize grants/revocation on the customer row and recheck permissions after lock acquisition. Never delete a retained provider identity during revocation.
9. External failure: fail invitation/save errors and compensate only the newly created identity; mark new attempts for existing unfinished-provisioning detection. Ambiguous timeouts/crashes still require controlled reconciliation.

## Results

Implemented current actor/branch checks under locks for grants and revocation. New account creation has bounded provider calls, attempt metadata, staging invitation suppression and fail-closed invitation/save behavior. Compensation deletes only the new identity created by that attempt; failed compensation explicitly requires reconciliation. Responses select only portal ID/email/link/access fields.

Revocation now disables access while retaining the provider identity and database link. The authentication guard sees the disabled customer and rejects its session instead of allowing onboarding fallback. Reactivation requires the same stored email and an existing provider identity with that email; it reuses the link without creating a new account or sending another invitation. Missing/mismatched provider identities require operator recovery.

- Full backend suite passed: 290 tests in 25 suites. Production build and focused customer-file lint passed. Working-file secret scan checked 412 files with zero blocked matches; whitespace checks passed.
- Ten focused tests cover invitation failure, database compensation/cleanup failure, existing-provider creation rejection, current actor/branch denial, retained-link revoke/reactivate, staging suppression, response fields, inactive customers and missing retained identities.
- Actual staging service/provider checks: two concurrent grants produced one account and one already-enabled rejection. A real customer provider session was accepted before revocation and denied after revocation. The provider account and its database link remained intact; reactivation reused the same identity.
- PostgreSQL lock-wait evidence confirmed an overlapping actor deactivation denied a pending revocation. Earlier staff/provider/directory/notification checks remained passing.
- All synthetic customers/staff/organizations and provider accounts were removed. No invitation, SMS or push was sent. No production migration or deployment occurred.

## Limits

Database and provider creation still cannot commit atomically; ambiguous timeouts, crashes and failed compensation use the controlled [recovery procedure](PROVISIONING_RECOVERY.md). Live customer invitation delivery/failure and end-user password recovery remain unverified. Retaining a disabled identity intentionally preserves linkage and prevents onboarding fallback; reactivation can permit its still-valid provider sessions again. It does not globally sign out the provider account or delete subscriptions. Existing installations that previously cleared identity links need manual reconciliation. Durable workflow journaling/serialized automatic cleanup and organization-onboarding linkage remain open.
