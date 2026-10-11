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

The backend role remains privileged and bypasses RLS. Runtime least privilege, trigger inventory, storage policy review and full historical financial reconciliation remain independent release gates.
