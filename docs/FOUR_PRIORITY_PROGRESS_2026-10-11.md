# Four-priority implementation progress — 11 October 2026

This is an incremental engineering checkpoint, not completion of all four work packages or approval for production. Application data used in live verification was synthetic.

## 1. Access and remaining mutations

Audit reads now hold a staff lock and recheck current active organization-administrator authority before reading tenant-scoped logs. Customer deactivation now shares the existing locked administrative customer check, including current manager branch scope. Approval execution passes its reviewer identity into that check. Deactivation still preserves financial history and disables portal access.

Focused audit/customer/provisioning/approval tests passed (46 cases before the subsequent financial/photo additions). Named product writes, cash handover writes, approval review and customer administrative paths already contain actor checks; that finding is not proof of every application path. Customer creation/import, broader report reads, provider-session revocation after request admission, and wider lock interactions remain review work.

## 2. Development schema reconciliation

Added and ran a reusable metadata-only development/staging comparator. Exact column metadata matches; there are 30 foreign-key update-action differences, two missing composite indexes, additional index-name drift and a genuine migration-checksum mismatch. No development DDL or history changes were attempted. See [schema reconciliation](DEVELOPMENT_SCHEMA_RECONCILIATION.md) for the safe baseline/rehearsal requirements. This package is investigated, not resolved.

## 3. Private collection evidence

New outbox submissions send no public photo URL. The payment is posted with its original stable identifier, and its complete matching acknowledgement is validated before private evidence grants are requested for that collection. Signed uploads use organization/collection-scoped randomized paths. Registration checks the object metadata, enforces supported image MIME types and a 10 MB maximum, and serializes same-path retries with a transaction advisory lock. Owned exact registration retries return the existing record.

The queue retains the original base64 photo and persists its uploaded private path. Failed upload/registration, malformed grants or mismatched document acknowledgement leave evidence queued. A confirmed payment is returned as confirmed even when photo delivery still needs retry, and its acknowledgement is retained with the queue entry. Subsequent retries use the same payment identifier. New payments for that loan remain blocked until its retained payment/evidence entry is cleared; no automated deletion/replacement is introduced.

Legacy queued public URLs with retained original bytes can be uploaded privately. Legacy URL-only entries are retained for explicit recovery rather than silently discarded or downloaded from arbitrary remote URLs. Existing database public URLs are no longer rendered as links/images in the collection viewer. Historical storage migration, old public bucket closure, orphan cleanup and URL-only recovery remain open; hiding links does not revoke historical public access.

The collection viewer requests a current authorized five-minute download grant and uses the shared accessible dialog. Generic document download now uses the API's actual `signedUrl` response field. The API refuses collection grants/signing when the bucket is absent, public or unavailable. Staging initially had no bucket; a private `collection-photos` bucket was created there with the supported MIME types and size bound. Development/production storage was not changed.

Live staging passed owned signed upload/download, denied another agent's download, denied unsigned public access, and returned the same document on registration retry. The test object and scoped database fixtures were removed. Direct authenticated Storage policy review, real browser/account-switch/device recovery and legacy migration remain deployment gates.

## 4. Financial correctness increment

Payment posting, payment reversal, cash handover creation and handover review now persist minimal explicit financial audit events inside their write transaction. Events use distinct names from supplemental HTTP outcome audits; their required persistence failures propagate and roll back the transaction. Audit fields contain amounts, dates, source IDs, method/status and reason-presence, rather than full request bodies, notes or identity data.

New arbitrary public photo references are rejected before payment creation; exact existing payment retries retain compatibility. Due lists and repayment posting accept active and defaulted loans. Partial default recovery does not silently reactivate the loan; ordinary full-payment closure remains unchanged. Closed/written-off loans remain excluded. Existing scope, overpayment, ordered allocation, duplicate/reversal and settlement checks remain in force.

Live staging injected an audit failure after payment/allocation work: the collection, paid schedule amount and loan totals rolled back. An equivalent cash-handover failure left no handover. Concurrent identical posting produced one financial audit. Partial repayment and reversal on a defaulted loan preserved classification and reconciled its original totals. Existing concurrent reversal, settlement rollback, approval, reassignment and direct-client denial checks also passed.

This does not resolve contract-versioned fee terms, partial-payment fee base, historical principal/interest allocation, carry-forward cash, dated historical reversals, self-verification policy, all lifecycle transitions or every financial audit path. No new fee policy was invented, historical debt rewritten, or scheduled fee behavior declared safe. These remain separate increments after schema/policy reconciliation.

## Threat boundaries

Current actor checks and explicit tenant predicates protect the named services; the privileged backend role remains a separate isolation risk. Signed grants are bearer capabilities with bounded download lifetime; already-issued grants are not instantly revoked by staff changes. Uploads are external side effects: interrupted uploads may leave orphan objects, while the original local photo is preserved. Private evidence depends on verified provider configuration and scoped policies. Admitted requests remain subject to existing provider-session checks and database transaction timeouts, rather than universal cancellation on subsequent logout.

No production release, real-customer migration, history rewrite or development reset occurred. Local verification and live staging evidence must remain distinct from GitHub CI and device testing.

Final local verification for this increment: 357 backend tests in 30 suites and 66 web tests in 7 files passed; both builds passed. Read-only lint of the changed backend TypeScript passed. Web lint reported no errors and five pre-existing warnings; the existing bundle-size warning remains. Working/index secret scans passed. These new commits have not been pushed or checked by GitHub CI.
