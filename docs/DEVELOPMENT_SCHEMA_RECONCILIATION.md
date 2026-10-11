# Development schema reconciliation — 2026-10-11

## Verified read-only findings

The fixed development project is `yvxtkzxqaqkhyntdszcu`. The inspector checks both connection identities before querying metadata and suppresses raw Prisma diagnostics. It does not read customer records or alter schema/history.

All expected tables and scalar/enum columns exist. All 14 application tables have RLS enabled and deny SELECT/INSERT/UPDATE/DELETE to anon and authenticated roles. Completed migration history contains only `0001_init`.

The Prisma comparison reports drift across eleven tables: foreign-key replacement differences, index renames, and missing composite indexes on collections (organization_id, collection_date, status) and loan_schedule (loan_id, status, due_date). The result is broader than two missing indexes. Column presence alone does not verify types/defaults, constraints, triggers, policies or historical data.

## Safe reconciliation constraints

Do not run migrations 0002/0003 blindly: objects already exist without matching history, and the additive staging migration intentionally rejects pre-existing untracked tables. Do not mark migrations applied solely because their tables exist. Inspect exact column types, enum values, constraint actions, indexes, privilege changes and migration checksums first.

Prepare a metadata-only environment-specific reconciliation plan. Preserve established foreign-key behavior unless a reviewed requirement changes it. Verify additive SQL and history alignment against a disposable representation of this schema; require an empty final Prisma diff, expected grants, preserved test totals and repeatable migration status. Back up application data through an approved secret-safe process before changes. Existing test data permission does not justify a destructive reset.

The staging database has all four migrations and an empty schema diff. Its result does not establish development history alignment. No development DDL or migration-history write was performed by the inspection.

## Remaining controls

## Expanded metadata comparison — 2026-10-11

`scripts/compare-development-schema.mjs` compares development with verified staging using repeatable-read, explicitly read-only transactions and trusted TLS certificate verification. It prints differences by object name, never environment values, raw defaults, function bodies or business rows.

The latest run found no differences in column types, nullability, precision or defaults, and no extra application columns. All 30 differing foreign keys retain the same delete actions but use ON UPDATE CASCADE in development and NO ACTION in staging. Two composite index definitions are missing; 23 other indexes have different names. Trigger names/enabled states match; function bodies and full policy semantics were not compared.

The recorded `0001_init` checksum matches neither the working migration file nor its Git blob. This rules out the current working-file line endings as the sole explanation. Only one version of this migration is available in local Git history. Migrations 0002–0004 remain unrecorded in development. No schema or migration-history writes were made.

Reconciliation remains open. Before changing history, reconstruct the applied baseline or adopt a reviewed baseline procedure preserving the original recorded evidence. Rehearse against a disposable representation of development, explicitly decide the update-action difference, review enum values and remaining constraints/policies/function bodies, verify backup/restore and preserved totals, then align indexes and history. Do not replace the checksum or mark migrations applied based on column presence. Staging remains unchanged by this metadata comparison.

The backend role remains privileged and bypasses RLS. Runtime least privilege, trigger inventory, storage policy review and full historical financial reconciliation remain independent release gates.
