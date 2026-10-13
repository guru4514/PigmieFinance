# Operational gate verification

## Threat review and authorized boundaries

1. Only an authorized operator can run fixed-project checks/deployment; no account or provider provisioning is implied.
2. Catalog inspection and recovery configuration flags disclose no credentials, connection URLs, Auth/application rows or provider diagnostics. The hardening migration changes table privileges, not business records.
3. Both environment identities, connection hosts and exact migration names/checksums are validated. No arbitrary target or SQL argument is accepted.
4. Browser principals must have no application-table privileges, including non-CRUD privileges. Tests measure effective privileges rather than assuming a direct REVOKE removes inherited grants.
5. Existing source data/history and catalog structure are fingerprinted; transactional rollback proves the proposed grants do not change them. A synthetic future table exists only inside the rolled-back rehearsal.
6. Credential loading uses ignored environment files. Development application requires a fresh authenticated encrypted backup with an exact isolated restore and matching source fingerprint.
7. Missing/expired credentials, stale evidence or unsupported migration histories fail closed. No anonymous or weaker-TLS fallback is used.
8. Lock timeouts, bounded statements, source checks immediately before deployment and normal Prisma migration registration limit races; run during a controlled maintenance window. Transactions do not provide a permanent application-write freeze between the last check and migration acquisition.
9. Failed operations roll back and suppress provider diagnostics. Applied history is never fabricated, rewritten or deleted. Confirm migration status after an interrupted deployment.

## Read-only findings — 13 October 2026, before migration 0008

`node pigmie-api/scripts/inspect-operational-gates.mjs` reads the locally configured runtime `DATABASE_URL` for both fixed environments with verified TLS, a read-only transaction and catalog-only queries. A transaction-local role-switch probe changes no data and rolls back. All output is aggregate privileges, known catalog identifiers and configuration-presence booleans.

| Check | Development | Staging |
| --- | --- | --- |
| Application tables, excluding migration registry | 15 | 15 |
| Browser SELECT/INSERT/UPDATE/DELETE grants, each privilege/role | 0 | 0 |
| Browser TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants, each privilege/role | 14 | 0 |
| Browser public-schema USAGE | Present | Present |
| Runtime login | Operator `postgres` | Operator `postgres` |
| Runtime BYPASSRLS / CREATE ROLE / CREATE DATABASE | All present | All present |
| Runtime application-table ownership / TRUNCATE | All 15 | All 15 |
| Application RLS enabled / forced | 15 / 0 | 15 / 0 |
| `pigmie_app` login / BYPASSRLS | Enabled / absent | Enabled / absent |
| Runtime SET LOCAL ROLE pigmie_app probe | Rejected | Rejected |
| RLS tables with app grants but no applicable policies | `approval_requests`, `push_subscriptions` | Same |
| Relevant browser schema CREATE / archived-history access | None | None |

The earlier claim that browser CRUD is denied remains correct. The residual privileges are a separate omission. RLS does not protect TRUNCATE; these catalog rights do **not** establish a direct HTTP exploit because PostgREST does not normally expose a table TRUNCATE operation. Never equate catalog execution grants with a proved dangerous RPC.

In both environments, `postgres` has public-schema default-table grants to anon/authenticated for TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. The provider-managed `supabase_admin` separately has all eight table privileges in its public default ACL for both browser roles. Migration 0008 removes current business-table privileges and only the verified `postgres`/public default ACL. It intentionally does not alter provider-managed roles, global defaults or Auth/Storage scopes. Provider-created public tables require separate settings review and effective-privilege checks before use.

Two public security-definer functions have browser EXECUTE: `current_staff_org_id` and the provider's event-trigger-only `rls_auto_enable`. The latter cannot be treated as an ordinary callable RPC. Catalog rights do not verify helper-body safety. The current session does not expose `pgrst.db_schemas`; actual dashboard/API exposed-schema settings remain unverified by this inspector.

## Completed browser grant hardening — 13 October 2026

Migration `0008_browser_grant_hardening` was reviewed, rehearsed in rolled-back staging/development transactions, then applied to staging followed by development through normal Prisma migration registration. All eight finished names/checksums match local SQL. Every original migration record, archived-history record, application data fingerprint and captured structural catalog fingerprint remained unchanged. A separate digest proves all other default ACLs, nonsecret role capabilities and role memberships remained unchanged. The final inspector independently confirms zero effective SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN privileges for anon/authenticated on all 15 application tables in both environments. Public-schema USAGE is retained.

A unique empty table created by `postgres` in `public` during each rehearsal and after each deployment had no effective browser privileges; the table was rolled back and not retained. Both development residual grants and `postgres`/public browser default grants are removed. Provider-managed `supabase_admin` default ACLs remain visible and unchanged, totaling 16 privilege entries; this is explicitly a remaining provider-settings/future-table review condition, not a claim that every possible future creator is protected.

Before development application, an authenticated encrypted full-metadata backup was retained and restored into a disposable restricted loopback PostgreSQL cluster. **51 tables** in that current snapshot matched exactly, including application/Auth/Storage metadata and archived migration history. The source snapshot fingerprint matched immediately before the grant rehearsal and apply. Evidence is in ignored restricted `.recovery/backup-ad7edc14-1620-402f-bda3-8de14ef2658b`; it contains secrets/data and must never be committed or displayed. The destination cluster was stopped and removed. Local restoration does not claim hosted ACL/ownership or provider runtime recovery.

The deployment tool uses exact seven-prior/eight-local migration guards, verified TLS, a PostgreSQL 17 capability guard, short lock/statement bounds, preapply source/ACL/provider rechecks and suppressed Prisma/provider output. Its rollback proof compares original ACLs after rollback; commit proof compares every prior migration row and source data/catalog/archived history. Invalid arguments fail before connecting. Script syntax and formatting checks passed. Successful live rollback/commit and future-table tests provide the meaningful verification for this privilege change; no application logic or Prisma model changed.

`deploy-browser-grant-hardening.mjs --staging` rehearses without committing; adding `--apply` performs the one-shot deployment. Development requires `--development backup-<UUID>` and optionally `--apply`. **These exact-baseline deployment tools deliberately reject an already-upgraded history.** Do not rerun them after 0008 or weaken their guards to bypass rejection. Use the read-only inspector to recheck current privileges; future migrations need a new reviewed baseline/deployment guard.

## Runtime least privilege remains a dependent rollout

`PrismaService` connects directly using `DATABASE_URL`. `TenantPrismaService` sets transaction-local organization context but performs no role switch. Explicit API ownership/branch/role checks therefore remain essential; RLS is not a second barrier for the current BYPASSRLS operator connection. A SET ROLE change alone is unsafe: the live role probe is denied, two application tables lack app policies, and unscoped provisioning/background workflows need a separately reviewed boundary.

Before declaring runtime least privilege complete, provision a dedicated non-owner, non-superuser, non-BYPASSRLS runtime login with a securely generated credential; keep migrations/operator credentials separate. Review every workflow's required grants and tenant/identity context, establish scoped approval/push policies, and verify cross-tenant reads/writes and provisioning/background operations with that actual login. The historical migration's public placeholder role password is not proof of the current password; the enabled legacy app login must be rotated or disabled through a controlled role rollout. No password verification attempt or role mutation was made by the inspector.

## Recovery configuration prerequisites

Neither local environment nor the inspecting process had `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `BACKUP_ENCRYPTION_KEY` or `BACKUP_OBJECT_KEY`. This is a presence check only; deployment secret stores and independent key escrow were not inspected. Local encrypted restore evidence does not establish off-site durability or independent key access.

Close external recovery gates with an accessible retained off-site object, a separate read-only retrieval credential, matching keys retrieved from independent escrow, and an isolated hosted destination/provider-settings inventory. Then run authenticated retrieval, isolated restore, hosted Auth/MFA/revocation checks and private Storage access/hash checks. Do not obtain those conditions by copying exposed secrets into documentation or by blindly replaying provider-managed schemas.
