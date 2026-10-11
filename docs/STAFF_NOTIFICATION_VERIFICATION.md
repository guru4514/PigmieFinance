# Staff provisioning and notification verification — 2026-10-11

## Changes and scope

Staff creation now locks and rechecks the active organization administrator before creating a provider identity. Branch validation precedes provider creation. Provider errors, invitation errors, mismatched invitation identities and database failures stop provisioning. After transaction rollback, the service deletes only the provider identity created by that attempt. Cleanup failures report that reconciliation is required; raw provider errors are not exposed. Provider requests have a ten-second timeout, and the encompassing transaction has a thirty-second timeout. New identities carry an attempt marker and organization ID in provider app metadata for reconciliation. Staging creation suppresses invitation delivery.

Push registration requires a supported HTTPS provider destination and bounded, correctly encoded subscription keys. Reviewed destinations cover FCM, Mozilla, Apple push subdomains and Windows notification subdomains; other destinations require review before support is added. Registration rechecks the active organization-owned staff/customer identity, including enabled portal access for customers. An existing endpoint can move between browser accounts only when its stored subscription keys match; mismatched keys cannot overwrite its owner. Unsubscription requires the current owner and matching subscription keys. Expired-subscription cleanup includes the original owner, endpoint and keys so it cannot delete a subscription rebound during delivery. Stored legacy endpoints are validated before outbound delivery.

SMS routes validate phone/message shape and batch bounds, then recheck the active administrator or branch manager. Every phone must belong to an active customer in that organization's permitted scope; a mixed-scope batch is rejected before any delivery. Bulk responses count accepted and failed deliveries rather than always returning success. SMS logs omit recipient numbers, message bodies and raw provider errors.

## Verification

- The final full backend suite passed: 264 tests in 23 suites. Production build and focused lint across the ten touched staff/notification files passed. The working-file secret scan checked 402 files with zero blocked matches, and diff whitespace checks passed.
- `pigmie-api/scripts/check-staging-provisioning.mjs` passed against the isolated staging project `sjelnxrlkrvwjcgqbvre`, using actual compiled services, PostgreSQL and provider account creation.
- Confirmed provider identity creation without an invitation; deliberately failed database insertion deleted the newly created provider identity.
- Confirmed mismatched-key takeover rejection, matching-key shared-browser transfer, owner-only unsubscription, unsafe destination rejection and inactive-subscriber denial.
- Confirmed branch-manager SMS scope and whole-batch denial for mixed branches. No SMS, push or invitation was sent.
- Synthetic organizations, staff, customers, subscriptions and provider accounts were removed; cleanup was verified. Credentials and subscription secrets were neither printed nor written into fixtures.

## Remaining limits

Provider creation and database commit cannot form one distributed transaction. A crash, ambiguous provider timeout before an identity ID is returned, or failed compensation still requires operator reconciliation using the attempt metadata. Durable provisioning/reconciliation jobs remain open. An invitation can be delivered before the database transaction commits outside staging; rollback deletes the account but cannot retract delivered mail. Live invitation failure/delivery and browser push behavior remain unverified.

SMS permission checks are a snapshot before an external send; they cannot revoke an already-started provider request. Phone matching uses the stored format without automatic normalization. Provider acceptance is not proof of final handset delivery, and console mode remains a mock. Staff mutation actor checks and named races are now verified in [staff mutation verification](STAFF_MUTATION_VERIFICATION.md). Other notification producers, provider timeouts/delivery receipts, remaining access paths and storage permissions require further review. These results do not establish release readiness.
