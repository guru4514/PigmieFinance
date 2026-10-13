# Document authorization — 2026-10-11

## Threat analysis

1. Existing staff/MFA roles remain; reload the active actor in the transaction.
2. Scope the actual customer/loan/collection by organization and current assignment/branch before every document operation. Accountants read only; deletion requires administrator/manager.
3. Reject file paths outside the exact organization/entity folder; safe filenames and UUID names prevent traversal/collisions.
4. Validate types/IDs in the service; registration verifies storage object existence and uses provider size/type metadata.
5. Service-role storage bypasses client policies. Direct-client photo uploads and bucket policies remain separate work.
6. Bound provider calls and return generic errors. Authorized signed grants are never logged or stored in test fixtures.
7. Signed capabilities expire at the provider; subsequent permission changes cannot retract issued links.
8. Hold the actor shared lock during signing; scoped record reads do not claim to lock every target assignment.
9. Storage/database failures deny success; metadata deletion does not claim storage object deletion. Tests use synthetic records only.

## Results

All 14 focused tests passed, including current actor/entity scope, forged paths, missing storage objects, authoritative provider size/type metadata, safe filenames and generic provider errors. The full backend suite passed 324 tests in 27 suites; build and focused lint passed.

Live staging used a private disposable bucket when the required bucket was absent. Authorized signing, actual signed upload of synthetic PDF bytes, registration and manager download succeeded (200). Registration stored provider metadata instead of forged client size/type values. An unrelated agent download returned 404; a foreign registration path returned 400. A controlled administrator deactivation denied the waiting download request (403). Exact fixture objects, document metadata, provider identities and application records were removed; the disposable bucket was removed only if this check created it.

Remaining limits: issued signed grants remain valid until expiry; target assignment rows are not locked by every document read; content inspection, application bucket policies and size/type restrictions need rollout review. The collection outbox still uses direct uploads and public photo URLs and must be migrated to an authorized private evidence workflow. Deleting document metadata does not delete its storage object.
