# Four priorities — third stabilization pass

This increment improves safety and verification; it does not complete all four packages or approve a production release. All live business fixtures were synthetic and removed. Application changes have not been deployed or publicly pushed.

## Backup and development schema

The development application's public schema was exported from one read-only repeatable-read snapshot, encrypted with the authenticated PGMBK002 format, retained under an ignored recovery directory restricted to the current Windows account, then decrypted from the saved artifact and restored into a disposable local PostgreSQL cluster. Fifteen tables, row fingerprints/counts, constraints, indexes, RLS, policies, functions and triggers matched the source snapshot. Tampering and wrong keys were rejected. The recovery key and application PII key remain only in the ignored `.env.local` beside the encrypted artifact; no plaintext dump was saved. The disposable cluster was removed.

This is a local application restore, not independent key escrow, off-site retrieval or complete Supabase recovery. Auth identities/MFA, Storage blobs, provider configuration, ownership/ACLs and platform extensions remain outside this restore proof. Legacy backup formats need separate recovery procedures.

Only after that backup passed, `reconcile-development-indexes.mjs` authenticated the retained archive, rehearsed two index additions with rollback, then applied them in development. The transaction locks the affected tables, verifies exact definitions, and checks loan totals/counts and migration history before/after. No business rows, foreign keys or migration-history checksums were rewritten.

The subsequent metadata comparison reports no expected column, enum, index-definition, policy-semantic or trigger-definition differences. Staging's provider helper `rls_auto_enable()` is absent from development. Thirty foreign keys still differ in update action; index naming and the unreconstructable initial migration checksum remain unresolved. Migrations 0002–0004 remain unrecorded in development. Expected-object comparison is not a complete inventory of every extra object, runtime grant or platform configuration.

## Financial safeguards

Early-closure calculations reject malformed installment numbering, invalid/nonmonotonic dates, invalid components and paid-status rows whose paid amount differs from due amount. The first installment may legitimately be due on the disbursement date; a live staging test caught and corrected an initially excessive restriction. Quote and settlement reject discrepancies between outstanding balance, unwaived scheduled debt and total payable less total collected. Existing proportional principal/interest allocation and the zero invented-penalty behavior remain; these are implementation rules requiring an agreed product contract before real lending.

Loan creation holds a shared product lock while taking its financial snapshot. The detail screen uses the API's outstanding balance and the loan's saved interest rate rather than a mutable product rate.

Scheduled overdue classification continues, but new late-fee amounts are disabled pending versioned terms and complete fee accounting. Existing recorded fees/balances are preserved. Product create/update rejects supplied nonzero fees, and new loan creation rejects an existing product with nonzero fees. The web product form defaults its flat rupee processing fee to zero and explains availability. This gate prevents silently promising unsupported charges; it is not implementation of immutable fee contracts, processing-fee posting, historical fee repair or full reconciliation.

## Evidence privacy and inventory

Both development and staging now have private `collection-photos` and `kyc-documents` buckets, limited to 10 MB and PNG/JPEG/WebP/PDF. Loan attachments share the collection bucket; collection registration itself still rejects PDF and allows images only. All document types require private buckets before grants; registration validates allowed MIME metadata and size. File content inspection/malware scanning is not implemented.

The restrictive API-only Storage policy now applies in development as well as staging. Direct anon/authenticated reads and inserts were denied. Live staging verified owned customer PDF upload, registration and signed download; another agent's download was denied. Existing collection grants/retry checks also passed. Signed grants remain bearer capabilities until expiry; backend credentials bypass RLS.

After fixture cleanup, the read-only inventory found zero legacy collection photo references, zero registered documents, and zero objects in both known buckets in each environment. There are no persisted server records in this inventory to migrate. It does not inspect old device queues, other buckets, externally retained copies, file content or browser caches. URL-only offline evidence recovery and real-device account isolation remain open.

## Threat review

1. Access: existing authenticated staff/entity scope checks govern grants and financial APIs. Maintenance scripts validate fixed development/staging identities and use operator credentials.
2. Modification: index tooling adds only two known indexes; policy tooling targets the two evidence buckets. No historical debt or migration history is rewritten.
3. Forged requests: backend entity/tenant checks and financial validation apply independently of UI controls. Inventory never fetches stored arbitrary URLs.
4. Malicious clients: nonzero product fees and inconsistent closure balances are rejected server-side. MIME metadata is not proof of safe file content.
5. Direct database access: restrictive evidence policy denies browser roles; privileged backend/database access remains a separate least-privilege gate.
6. Secrets: credentials stay in ignored environment files or process memory; retained encrypted backup and keys stay ignored with restricted local ACLs. Logs omit raw connection strings, rows, paths and provider diagnostics.
7. Expired authentication: API session admission remains unchanged; issued signed capabilities expire separately and are not revoked by these changes.
8. Concurrency: product locks protect creation snapshots, existing settlement locks remain, index DDL uses table locks, and backup comparisons use one exported snapshot. This does not prove every application race resolved.
9. External failures: private-bucket lookup failure rejects grants; invalid backups fail authentication before restore; failed retention attempts remove only that attempt's directory. Independent off-site recovery and real-device retry failure cases remain unverified.

## Verification and remaining release work

The final full backend suite passed 376 tests in 33 suites, and the backend rebuilt successfully. Focused backend lint passed. Web build and 66 tests passed; lint reported zero errors and five existing warnings. The existing bundle-size warning remains. Live staging financial, authorization, private evidence and cleanup checks passed after the final admission guard. Working-file secret scanning and whitespace checks passed. Local checkpoint staging must also pass the staged secret scan; retained recovery artifacts and environment files are excluded.

Remaining packages: reviewed migration baseline adoption and foreign-key decisions; immutable/versioned loan and fee contracts with historical reconciliation; device offline cold-start/account-switch/eviction/recovery and browser MFA exercises; independently recoverable off-site backup plus Auth/Storage/platform restore. Broader audit retention, dependency findings, least privilege and report definitions remain release gates. Start the improvement roadmap only against the applicable verified prerequisites; do not label these gates complete from unit tests alone.
