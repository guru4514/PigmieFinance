# Isolated staging setup

Status: the separate hosted project is configured and verified in Mumbai on 2026-10-11: `sjelnxrlkrvwjcgqbvre`, under the existing PigmieFinance organization. Four migrations are applied and Prisma's schema diff is empty. The ignored local configuration contains staging credentials and a fresh encryption key. See `STAGING_VERIFICATION.md` for live checks and remaining limitations.

Requested project: `pigmie-finance-staging`, in the existing organization that owns `yvxtkzxqaqkhyntdszcu`, using Mumbai where available (Singapore fallback). Select a free plan only; do not upgrade or pause/delete another project to make room without user instructions. The current project is excluded by the launcher regardless of whether it is called development or production.

## Provisioning

1. Sign in to Supabase in the open browser, select the owning organization, and create a separate project. The account owner must enter/save the new database password themselves; never paste it in chat.
2. Keep data synthetic. Do not restore a production backup, reuse encryption keys, or import customer identities, documents, contact details or balances.
3. Copy `pigmie-api/.env.staging.example` to the ignored `pigmie-api/.env.staging`. Fill it locally from the new project's settings. Use a fresh 32-byte random encryption key encoded as 64 hex characters. URL-encode the database password in connection URLs.

   For the already prepared local file, run `& .\pigmie-api\scripts\configure-staging.ps1` from a PowerShell terminal at the project root. Paste the saved staging database password into the hidden prompt and press Enter. The helper encodes it and replaces both placeholders without printing the password. It does not contact the database. The ignored file contains plaintext credentials needed by the application; keep it local and exclude it from screenshots, uploads and commits.
4. Use the direct database connection or session pooler on port 5432 for `DIRECT_URL`; transaction pooling on port 6543 is not suitable for migrations. Both connection URLs must include the verified-TLS parameters described below. The runtime connection may use either connection type.
5. The browser receives only the staging anon/publishable key, never the service key. Configure staging authentication redirect URLs for `http://localhost:5174`. Provider authentication emails need their own safe test mailbox/SMTP sink; application delivery suppression does not suppress Supabase's own emails.

## Local launch and checks

Run from `pigmie-api`:

```text
node --test scripts/staging.test.mjs
node scripts/staging.mjs check
node scripts/staging.mjs status
npm run build
node scripts/staging.mjs start
```

In a second terminal in `pigmie-api`:

```text
node scripts/staging.mjs web
```

The API uses port 3001 and the web uses port 5174. Startup uses an explicit environment, drops inherited provider settings, and disables default runtime environment-file loading. The web launcher validates its public key separately and does not pass backend secrets to Vite. Application email/SMS/push delivery is suppressed in staging; in-app notifications remain available. Supabase account creation/invitation still affects the staging provider, so use synthetic users and controlled mailboxes only.

`check` validates local isolation and verified-TLS settings without contacting the provider. `status` reads migration state; `diff` writes a read-only schema comparison to `docs/STAGING_SCHEMA_DIFF.sql`. These commands do not apply migrations. The separate `deploy-staging.mjs` helper is constrained to this exact staging project and expected migration history, with a transactional rollback check before deployment. It is not a generic deployment command and must not be reused for production. No database-reset command is exposed.

The supplied public CA certificate came from the official staging dashboard's download link. Runtime `DATABASE_URL` uses `sslmode=verify-full` and `sslrootcert`; Prisma tooling `DIRECT_URL` uses `sslmode=require`, `sslaccept=strict` and `sslcert`. Absolute certificate paths must be updated if this checkout moves. Certificate verification is required by the launcher.

## Required before staging migration deployment

- Review initial schema, Supabase prerequisites, RLS, Prisma schema drift and the TOTP compatibility migration against an empty database.
- Confirm the database identity/permissions using a staging connection without printing secrets.
- Apply reviewed migrations only to the verified new project; record results and retain a recovery plan.
- Exercise real tenant restrictions, mandatory MFA/recovery/re-enrollment, concurrent collections/reversals/approvals, exact payment retry and reconciliation.
- Test browser cold start/offline recovery and account switching against synthetic users on the actual API.

No production deployment or credential rotation has been performed. The remaining release blockers are tracked in `STABILIZATION_PROGRESS.md`.

### Historical finding and resolution

The initial history lacked KYC status, approval/push tables and two financial query indexes. `0003_align_application_schema` adds the missing objects, enables RLS on new tables and revokes direct application-table privileges from anonymous/authenticated clients. `0004_financial_query_indexes` adds the two indexes. Prisma explicitly maps historical index names and ON UPDATE NO ACTION behavior, preserving existing foreign keys rather than rebuilding them. All four migrations are verified/applied to staging. Existing untracked production objects require separate drift reconciliation before these strict additive migrations can be deployed there.
