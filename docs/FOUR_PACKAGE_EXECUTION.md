# Four-package execution plan — 11 October 2026

Work order: verified development baseline; immutable financial contract implementation; offline/device and MFA recovery; complete backup/platform recovery. Passing one package does not close the others.

## Baseline decision and planned checks

Retain original migration records verbatim in a private non-API schema, then adopt the four current migrations as a verified baseline after schema equivalence checks. Baseline records explicitly describe adoption rather than historical execution. Never manufacture the unknown original SQL or silently replace its recorded checksum. The original records also remain in the retained encrypted development dump.

Align the 30 legacy update cascades with the current model's NO ACTION behavior. Identity keys remain stable; application operations change relationship fields rather than primary IDs. Delete actions remain unchanged. Reject any difference beyond known update cascades and equivalent index names. Compare columns, all constraints/indexes, RLS, policy semantics, enum labels, application functions and triggers in both directions. Staging's provider-managed rls_auto_enable helper is excluded explicitly; no provider helper is copied into development.

First rehearse against an exact development restore. Before live application, authenticate the saved backup, require fresh successful rehearsal metadata, match source/canonical/schema/history/migration digests, and take table locks. Verify every business-table row fingerprint before/after and archived history equality inside the transaction. Any unexpected difference or lock failure rolls back. Perform read-only Prisma schema/status checks afterwards. Direct-role denial and platform configurations remain independently verified controls.

## Threat review before execution

1. Access: tooling uses authorized operator credentials for fixed development/staging projects; no new public endpoint is introduced.
2. Modification: only known constraints/index names and baseline records change. Business records and original history must remain identical. Original history is retained outside public API schemas.
3. Forged input: command arguments are allowlisted and archive paths resolved within the ignored recovery root. Metadata SQL is sourced from validated operator-controlled databases, never client requests.
4. Malicious clients: runtime tenant/MFA/role controls remain; stable IDs cannot cascade to related financial identities after alignment. Client fee inputs will remain rejected until contract accounting is implemented.
5. Direct database queries: browser-role privileges are checked; the history archive denies PUBLIC, anon, authenticated and application roles. Privileged database users still require separate least-privilege review.
6. Secrets: archive/key remain ignored and restricted locally. No connection values, business rows, raw provider diagnostics or credentials are logged. Published evidence contains counts/status only.
7. Authentication expiry: maintenance connections do not create runtime sessions; existing API admission and signed grant expiry remain. Browser revocation/recovery still needs a separate test.
8. Concurrency: live baseline takes application-table locks and checks unchanged source evidence before DDL. Any unknown concurrent change invalidates the rehearsal. Product snapshots and financial posting require their own transaction locks.
9. External failure: DDL/history adoption is one transaction with rollback on any failure. Retained backup is not removed after a successful verification. Local restore cleanup is scoped to its unique run; off-site retrieval and full platform restore are separate proof obligations.

## Evidence

Results will be appended as each package is verified. No production or complete-platform readiness is asserted by this plan.

### Package 1 — applied and verified

An exact development dump from a read-only snapshot was retained encrypted, restored locally and compared across fifteen tables and application metadata. Baseline adoption on that restored copy passed: 30 foreign-key update actions aligned, 23 indexes renamed, original history archived verbatim and every business-row fingerprint preserved. The local cluster was removed. A live-development locked dry-run then passed and rolled back before the identical operation was applied in one transaction. The original history remains in `pigmie_migration_evidence.original_history`, explicitly denied to browser/application roles; the encrypted pre-adoption archive also retains it.

Read-only development Prisma comparison now matches the schema, all four baseline migrations are recorded, and all fourteen application tables deny browser-role access. The adopted history records explicitly say baseline adoption, with zero executed steps; they do not represent historical execution of missing SQL. The source checksum evidence is preserved rather than lost. Source/canonical/data/history/migration digests bound the live operation to the fresh exact-copy rehearsal. This closes the identified schema/history baseline discrepancy, not full financial correctness or platform recovery.

### Package 2 — immutable evidence and safe historical admission

Migration 0005 adds nullable JSON evidence to loans and payments without backfilling guessed historical facts. Loan contract snapshots are immutable through a database trigger. Once a payment's allocation evidence is saved, it cannot be overwritten or removed. Object/version checks reject invalid INSERT evidence; normal payment status updates remain supported. The staging rollback rehearsal verified those rules and unchanged original rows. Prisma deployed the additive migration to both environments; development subsequently reported five applied migrations, up-to-date status and an empty schema diff.

New loans save version 1 of the financial policy, original amount/rate/tenure/frequency, INR rounding/business timezone, proportional component allocation, daily accrued-interest early closure and zero fees/penalty. Admission rejects unsupported versions/policies rather than interpreting them with today's rules. This release supports zero-fee contracts only. Nonzero fee posting, borrower disclosure/acceptance, durable contract amendment versions and their reconciliation remain open; immutable evidence is not proof of legal agreement.

New payments save the exact installment IDs and amounts in their posting transaction, before the required audit commits. Reversal validates their sum, uniqueness and current row/loan scope and subtracts from those original installments. A two-installment live staging lifecycle verified that reversing the earlier payment leaves the later installment fully paid and reopens the paid loan with the correct outstanding balance. Changing the product after loan creation did not change saved loan rate/zero-fee terms. Direct contract/allocation overwrites were rejected. Historic NULL allocations are now rejected for automatic reversal; the system does not guess newest-paid-first history. New postings reject schedule/outstanding discrepancies and invalid schedule components/status balances.

Read-only development inventory found 25 unknown historical contracts, 197 unknown payment allocations, 79 rows containing fees above original components, 11 schedule/outstanding mismatches and one invalid schedule balance. Loan-level arithmetic and totals of recorded collections matched; no cross-tenant/wrong-customer relationships were found by the named queries. These are retained test records, not repaired debt or verified historical contracts. Staging inventory was empty with zero inconsistencies after fixture cleanup. Original test evidence stays available for controlled reconciliation; unsafe operations fail closed.

### Package 3 — provider verification and device gates

Live staging provider/API tests passed: first-factor tokens denied protected APIs, verified second factor accepted, inactive/deleted identities denied, global sign-out rejected access and refresh tokens from both synthetic client sessions, lost-factor recovery required fresh enrollment, and access was restored only afterwards. The synthetic provider identity and database fixtures were removed. These were programmatic client sessions, not physical devices or browser UI tests.

Removed the unused `offline-sync.ts` helper after confirming no imports. It replayed arbitrary endpoints without authentication and logged queued payloads. The active account-scoped `offline-queue.ts` remains, and no IndexedDB database or queue was deleted. Its existing automated recovery/account-switch tests and web build passed. Physical cold start, browser storage eviction, service-worker upgrades, interrupted evidence uploads and user-visible MFA recovery remain unverified; the device acceptance matrix identifies the required evidence.

### Package 4 — verified local restore and external limits

The post-migration development dump was retained encrypted and restored successfully: fifteen public tables, schema/data fingerprints, functions/triggers/policies/indexes matched, and the private archived original migration history also restored identically. Tampered archives and wrong keys were denied. No plaintext dump was persisted; the disposable cluster was removed. The complete database backup workflow already includes all database schemas; application-only rehearsal now includes the private history archive when present.

Local R2 account/access key/secret/bucket and backup-encryption settings are absent (presence booleans only were inspected). GitHub's secret configuration could not be independently inspected because the GitHub CLI is unavailable in this environment. No remote secret values were obtained or guessed. Off-site upload/retrieval, independent key escrow and full Auth/Storage/provider-configuration recovery are not verified. The local restore cannot close that package.

### Failures investigated

One extended financial live run hit a transaction timeout and its cleanup was not confirmed. A narrowly bounded recovery tool verified exactly one recent synthetic test organization, its known identifiers and absence of evidence objects, then removed it and checked removal. The isolated rerun passed the full lifecycle and cleanup. Aggregate lock inspection found no blocked sessions at inspection time; this does not prove a root cause or production performance under sustained load. A proposed allocation-before-insert optimization failed the identifier-collision regression test and was reverted. No transaction timeout was increased to hide it.

The initial MFA rerun lacked the required local staging API. Its temporary identity cleanup succeeded. Added a preflight that checks API availability before creating provider fixtures, started the validated staging API, then verified the complete provider flow. Financial test runs now retain a small ignored journal containing only synthetic organization/project identifiers so failed fixture cleanup can be investigated without logging secrets. Successful cleanup removes the journal.

### Final verification for this increment

388 backend tests in 34 suites passed after the historical admission guards. Backend build and focused lint passed. Web build and 66 tests in seven files passed; web lint had zero errors and the five existing warnings. Its existing bundle-size warning remains. Final live financial checks passed after the guards, including the complete two-installment contract/reversal lifecycle, and exact synthetic fixture/object cleanup succeeded. Provider MFA/recovery passed with identity cleanup. Script syntax, working-file secret and whitespace checks passed; staged files must pass a separate secret scan before the local commit. No environment files, retained keys/dumps or fixture journals are included in checkpoints, and no new public push or production deployment was performed.
