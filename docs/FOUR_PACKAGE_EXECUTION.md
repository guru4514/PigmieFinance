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
