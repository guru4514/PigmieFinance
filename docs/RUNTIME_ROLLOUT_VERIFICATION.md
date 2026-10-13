# Runtime isolation rollout

This package separates the API login from the operator login. Operator credentials remain available to reviewed migration, backup and synthetic-fixture tools; application startup must require the restricted runtime URL. No live rollout is claimed until the verification below has actually run.

## Security review

1. **Assets:** tenant records, Auth identities, financial audit evidence and database credentials.
2. **Actors:** authenticated API callers, background jobs, database operators and compromised runtime processes.
3. **Entry points:** runtime database connections, tenant/identity transaction context and narrowly shaped bootstrap functions.
4. **Boundaries:** runtime is neither owner nor superuser, has no memberships or bypass, and cannot read Auth/Storage or migration evidence tables directly.
5. **Isolation:** RLS receives transaction-local context; unscoped reads return no tenant rows, foreign writes fail and identity context expands SELECT only.
6. **Race controls:** migration history, business rows and backup-source evidence are checked immediately before deployment. A legacy application session or unexpected external policy dependency stops rollout.
7. **Secrets:** generated passwords exist only in memory and the existing ignored environment file. Provider messages and connection strings are suppressed. Operator URLs are preserved.
8. **Failure handling:** deployment rehearses and rolls back DDL before Prisma registration. Credential provisioning restores the prior file if its role transaction fails; after a committed activation, connectivity failures are reported without silently rotating again.
9. **Verification:** exact prior/local checksums, encrypted fresh restored development backup, rollback of catalog/rows/history/ACLs/default grants/role changes, actual restricted TLS login, cross-tenant denial and commit/rollback context clearing.

## Tools and order

1. `deploy-runtime-isolation.mjs --staging` rehearses migration 0009 and rolls it back. The `--apply` suffix performs normal Prisma deployment after the same proof. No role password is present in migration SQL.
2. After reviewed migration application, `configure-runtime-access.mjs --staging` activates the restricted role and adds `RUNTIME_DATABASE_URL` only to the existing ignored `.env.staging`. It refuses to overwrite an existing runtime configuration.
3. `check-staging-runtime-isolation.mjs` creates explicitly synthetic organizations/staff using the operator connection, exercises the actual restricted runtime connection, and cleans up its synthetic organizations. No customer/Auth records or secrets are logged.
4. Development deployment requires `--development backup-<UUID>` naming a retained, restored, encrypted backup verified within 24 hours. The source evidence must still match exactly. Provision development only after staging integration succeeds.
5. `operator-fixture-client.mjs` provides a separate operator Prisma client for administrative verification scripts. It must never be imported by application modules.

## Verification state

Script syntax checks and formatting passed. Staging migration rollback rehearsal passed on 2026-10-14: restricted role attributes/grants and unscoped RLS reads were verified; catalog, business rows, original/current history, schema/function ACLs, default privileges and role memberships were unchanged after rollback. Managed `postgres` requires a temporary membership to switch role; this is granted only inside the rehearsal transaction and its rollback is verified. It is never included in deployed SQL.

Development rollback rehearsal also passed against fresh retained encrypted backup `backup-d2f61cc3-048b-41bd-abb6-05828d21f427`. Its disposable restore compared 51 public/Auth/Storage/history tables, data fingerprints, constraints, indexes, policies, functions and triggers. Wrong-key and tampered archives were rejected. The backup's migration digest matches finalized 0009 SQL.

Staging 0009 was then applied through Prisma: all nine checksums match, the original eight migration records and business records are unchanged, and the restricted role was activated with its generated password only in ignored `.env.staging`. Actual TLS runtime login passed; attributes, no memberships/ownership, no Auth/Storage/history table grants and browser denials were verified. The live synthetic proof passed cross-tenant read/write denial, unscoped empty reads, forbidden Auth/history/schema-create/privileged-role access, identity SELECT-only behavior, onboarding context/mode bounds, provider-session identity binding, paired provisioning parameters, and context clearing after commit/rollback. Synthetic fixtures were removed. Operator URLs remain unchanged.

After staging integration passed, development 0009 was applied through Prisma against the same fresh source-bound backup. Exact nine checksums, unchanged original eight history records and unchanged business records were verified. The development restricted login was activated with its generated credential saved only in ignored `.env`; operator URLs were preserved. Read-only inspection of actual runtime connections on both environments verified restricted attributes, zero memberships/ownership/truncate privileges, all 15 tables under RLS, all 15 unscoped reads empty, and direct Auth/history reads denied. The legacy application login is disabled and browser roles have zero application-table privileges.

The orchestrator also verified staging financial service transactions, provisioning concurrency/recovery/directory/private-document/push integration, and the actual compiled API's MFA HTTP flows with the restricted account. Those flows included first-factor denial, second-factor acceptance, inactive identity denial, both-device sign-out/session denial, refresh rejection, fresh-factor recovery and deleted-identity denial. Synthetic fixtures were cleaned and the isolated HTTP server stopped before development rollout.

Existing hosted deployments must also receive the new runtime secret and restart on the verified build before their runtime identity is considered proven. No claim about hosted deployment or unrelated physical-device/off-site recovery gates is implied by local configuration.

## Deployment secret separation

The local maintenance environment contains operator credentials so migrations, backups and reviewed fixtures can run. The API deployment secret store needs only the runtime database credential and the API's other required settings. Do not copy the combined local maintenance file into the API deployment. Omit `DATABASE_URL` and `DIRECT_URL` from the API process entirely; migration and backup jobs should use a separate restricted-access operator secret store.

API-only placeholders:

```dotenv
RUNTIME_DATABASE_URL=REPLACE_WITH_RESTRICTED_PIGMIE_RUNTIME_CONNECTION
SUPABASE_URL=https://REPLACE_WITH_PROJECT_REFERENCE.supabase.co
SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_SERVER_ONLY_SUPABASE_SECRET
PII_ENCRYPTION_KEY=REPLACE_WITH_64_HEX_CHARACTER_ENCRYPTION_KEY
CORS_ORIGIN=https://REPLACE_WITH_APPROVED_WEB_ORIGIN
PORT=3000
```

Bundle the public Supabase CA certificate with the verified API build. The API validates the project/role, forces verified TLS, and checks restricted database attributes at startup. Operator connection values are unnecessary for API startup and must not be supplied as fallback credentials. Optional mail/push/object-storage settings, when enabled, also belong only in server secret stores.

`inspect-operational-gates.mjs` now reports `maintenanceAccess` from `DIRECT_URL` separately from `runtimeAccess` obtained using the actual `RUNTIME_DATABASE_URL`. A missing runtime configuration is explicitly unverified; an operator connection is never labeled as runtime evidence. A configured runtime connection must pass its restricted role, membership, ownership, RLS, truncate and inherited-context assertions.

The local staging launcher accepts absent runtime configuration for maintenance checks while requiring it for API startup. A supplied runtime URL must identify the correct project, restricted role and verified TLS. API startup receives only its explicit server settings, excluding operator URLs and any combined dotenv-file pointer. Browser startup receives only public settings. All ten staging tests pass: six retained regression tests cover notification-secret exclusion, project separation, migration session pooling, verified TLS, reused secrets/incomplete examples and legacy JWT claims; four new tests verify missing-runtime startup denial, owner/foreign/insecure/placeholder runtime URL rejection, isolation from ambient/maintenance secrets, and separate browser/maintenance payloads.
