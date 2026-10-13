# Backup and restore verification — 11 October 2026

## Verified outcome

A real PostgreSQL custom-format dump of staging's public schema was encrypted with the new versioned format, authenticated, restored into an isolated local PostgreSQL 17.11 instance, and compared against the same exported read-only snapshot. All 15 tables (including migration history) matched by row counts and order-independent row fingerprints. Constraints, indexes, RLS settings, policies, application functions and triggers matched. No source business data/schema/history was changed.

The initial data comparison failed because database sessions serialized timestamps in different time zones. Setting both comparison sessions to UTC corrected the comparison; restoration itself had succeeded. The final expanded rehearsal passed. Each disposable server was stopped and its cluster/password file removed, including failed runs. No plaintext dump file, archive encryption key or provider diagnostic was written to the repository or terminal.

This verifies application database restoration, not a full disaster recovery exercise. The local auth.uid() dependency is a stub returning NULL; Supabase Auth users, factors, provider behavior and identity recovery were not restored. Storage metadata/blobs, ACLs/ownership, managed extensions outside public, runtime secrets and external service configuration were not verified. Row fingerprints are comparison evidence, not financial-policy correctness or a hostile-data cryptographic proof.

## Implementation

The shared format in `pigmie-api/src/common/utils/backup-format.util.ts` uses AES-256-GCM with a random 12-byte nonce and a 16-byte authentication tag. Its 20-byte header contains `PGMBK002` and the nonce and is also authenticated. It requires a separately managed 32-byte hexadecimal backup key. Decryption returns no archive bytes to restoration until authentication of the complete input succeeds. Tests reject modified header, nonce, ciphertext/tag, truncation, wrong key, weak key and legacy format.

`scripts/backup-db.ts` now streams a complete database custom-format dump through this shared encryption code to R2 under `backups/*.pgbk`. It preserves dump ownership/grant metadata; no schema filter narrows the production dump. Local rehearsal restores only public and deliberately skips ownership/grants, so it does not verify the complete production archive. DIRECT_URL is preferred to avoid transaction-pooler limitations. Existing individual DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME platform variables remain supported. TLS always verifies the certificate and hostname using the explicitly supplied trusted CA. Historical Prisma sslcert parameters do not override that CA; configurations with client private keys remain unsupported.

The scheduled workflow now invokes the same backup implementation. Database/encryption/storage credentials enter through environment mappings, never interpolated shell arguments. It installs PostgreSQL 17 client tooling through the official PostgreSQL Ubuntu repository, uses read-only repository permissions, limits job duration and serializes backup runs. It writes no intermediate plaintext dump or encrypted archive to the runner filesystem. Existing abort/delete-on-failure safeguards remain. These code changes are local: the scheduled workflow has not been dispatched or verified on GitHub.

The previous TypeScript IV-prefixed AES-CBC format and workflow OpenSSL/PBKDF2 format were different and had no unified restore path. Version 2 intentionally rejects those archives. Existing archives/keys must be retained; do not replace their keys or delete them assuming version 2 migrates their contents. Legacy recovery needs its own isolated review. Configure a new separate 64-hex-character key in the platform secret store before enabling the new workflow; never reuse the PII key or print keys. A scheduled job with a missing/malformed key fails rather than falling back to CBC.

## Repeatable staging rehearsal

From `pigmie-api`, build the backend, then run:

```powershell
npm run build
node scripts/rehearse-backup-restore.mjs
```

The script validates the fixed staging identity against development and uses trusted TLS. It supports portable tools in the ignored workspace `.recovery/pgsql/bin`, or `RECOVERY_PG_BIN` pointing to a compatible trusted tool directory. Windows tools used here came from the [official EDB archive page](https://www.enterprisedb.com/download-postgresql-binaries), linked by the [PostgreSQL Windows download page](https://www.postgresql.org/download/windows/). Ubuntu workflow installation follows the [PostgreSQL repository instructions](https://www.postgresql.org/download/linux/ubuntu/). No system service was installed.

It exports a repeatable-read read-only snapshot so dump and comparison see identical source data. Archives and encryption key stay in memory, with a 256 MB rehearsal dump bound and tool timeouts. Each local target uses a unique ignored run directory, SCRAM password authentication and loopback-only listening. The temporary initdb password is stored only in that run's ignored `.env.local`, then deleted with the stopped cluster. No shared/default local server is used. Source API/storage credentials are not copied into subprocess environments.

Restoration consumes authenticated bytes over stdin with exit-on-error and a single transaction. Cleanup removes only a verified resolved UUID run directory under `.recovery`, after server shutdown; cleanup failures produce fixed diagnostics. Portable downloaded tooling remains ignored for repeat runs. The rehearsal is not an operator command for restoring arbitrary archives or production environments.

## Remaining backup release gates

1. Configure the independent backup key and R2 credentials/bucket in a platform secret store. Local development/staging configuration currently contains none of those variables; no R2 upload/download was attempted and remote GitHub secret availability was not inspected.
2. Verify upload, download, retention, failed-object cleanup, restricted bucket access and complete authenticated restore from the retrieved object. A live database dump alone is not an off-site backup.
3. Add and verify the operator restore path for stored version-2 and legacy archives, with target identity checks, empty-target rules and controlled replacement. The reusable decryption and isolated rehearsal are not a complete general restore tool. Large archives need bounded-memory authenticated staging before any restore writes.
4. Verify database ownership/grants, managed extensions, Supabase Auth and Storage recovery, plus separately escrowed PII/application keys and provider configuration. Database backups do not include Storage file bytes.
5. Take and preserve a recoverable development backup, verify its restore, and finish the reviewed baseline procedure before changing development schema/history. This staging rehearsal alone does not authorize treating development's unknown initial migration as resolved.

## Threat review

1. Access: staging rehearsal requires locally available staging credentials and fixed identity validation. No API route exposes the tooling. Scheduled backup secrets belong in platform stores.
2. Modification: source snapshot is read-only; only a new disposable loopback cluster is restored. Cleanup is confined to the verified run path. Production backup writes only a new timestamped R2 object.
3. Forged requests: no browser input or arbitrary external URL is accepted by the rehearsal. Provider connection identity and TLS are checked before reading data.
4. Malicious inputs: restore bytes must pass version/key/tag checks; wrong keys or modified bytes never reach pg_restore. CLI arguments are structured and credentials are excluded from arguments. Arbitrary stored-file restore remains a separate gate.
5. Direct database access: local target requires SCRAM and listens only on loopback. Restored policy bodies match, but restored ownership/grants and privileged backend isolation remain outside this check.
6. Secrets: credentials remain in ignored env/platform stores or process memory/child environment. No plaintext dump, raw stderr, provider response or data row is logged. The initdb-only credential file is removed after shutdown.
7. Expiry: this tooling is operational rather than a user session flow. Provider credential rotation can terminate dumping; no fallback disables certificate verification. Identity/MFA recovery is not established here.
8. Concurrency: exported source snapshot gives one consistent comparison. Local targets have UUID paths and a reserved loopback port; a port race fails without choosing another database. GitHub backup runs share one concurrency group.
9. External failure: dump/upload abort and failed-object cleanup remain bounded/best effort. A missing executable, wrong archive key, restore failure or comparison failure fails the rehearsal and triggers target cleanup. Off-site retrieval/retention failures still need live verification.

## Local checks

367 backend tests in 32 suites passed. Backend build, focused utility lint and separate backup-script type checking passed. Workflow YAML parsed successfully and secret expressions occur only in environment mappings, not run commands. Secret and index scans must pass before the local checkpoint commit. No frontend code changed in this increment.
