# Credential remediation — 2026-10-11

The owner confirms that existing development organizations, staff and customers are disposable test data. No real customer data is claimed by this verification.

## Encryption remediation completed

- Development contained 29 customers, 21 staff and 13 organizations. Two customer ID fields contained encrypted values; there were no stored legacy custom MFA secrets. Staging contained no customers, staff or organizations and no encrypted fields or legacy MFA secrets.
- Before remediation, both encrypted test ID fields failed authentication with the configured replacement key. Both were recoverable using the historical key. Merely changing configuration had therefore left these fields unreadable to the application.
- Generated a fresh, undisclosed 32-byte encryption key in memory. Re-encrypted both test ID fields under database transaction/table locks, preserving their plaintext values without printing them. Preserved all other test records.
- Updated only the ignored development environment configuration. Staging encryption configuration was not changed. No application source or schema change was necessary.
- Verified round trips, rejection of the previous keys against replacement ciphertext and rejection of tampered ciphertext. A separate process loaded the saved configuration and confirmed that the actual compiled application encryption service decrypts both stored fields.
- An ignored `.env.local` file held the target key only during the configuration transition, allowing recovery if the database commit succeeded but configuration writing failed. It was removed after successful verification. No secret-bearing test script or database dump was created.
- Scanned 327 current tracked files and existing frontend build files for exact matches to the current backend service keys, encryption keys and database passwords. No matches were found. This is a bounded check, not a comprehensive historical/log/backup scan.

## Provider revocations independently verified

Read-only live checks independently verified all eight outcomes on the development project:

| Check | Historical credential | Current replacement |
| --- | --- | --- |
| Transaction pooler, port 6543 | Authentication rejected, PostgreSQL `28P01` | Connected; `SELECT 1` passed |
| Session pooler, port 5432 | Authentication rejected, PostgreSQL `28P01` | Connected; `SELECT 1` passed |
| Supabase admin authentication API | Legacy service-role key returned HTTP 401 | Secret key returned HTTP 200 |
| Supabase public authentication settings API | Legacy anonymous key returned HTTP 401 | Publishable key returned HTTP 200 |

Requests printed only result metadata, not passwords, keys or response bodies. No account or financial data was changed by these checks. This verifies the tested credentials/endpoints at the check time; it is not an inventory of every provider key or deployed service.

## History inventory and prevention

- Scanned 1,078 reachable Git blobs across 125 commits on local refs for exact matches to the known historical database password, service-role key and encryption key. Matching credentials were confined to a historical `envs.txt` blob. Remote-only refs, unreachable objects, clones and external caches were not scanned.
- Added `scripts/check-secrets.mjs`: checks current tracked/unignored files or, with `--staged`, actual staged content. Reports file paths and credential categories only. Detects selected privileged Supabase keys/JWTs, literal encryption keys, embedded database passwords and private-key headers. This is a focused guard, not a complete secret detector.
- Added a separate CI workflow for all pushes/pull requests. Local detection tests plus existing staging configuration tests passed (11 tests). The current working-file scan passed on 396 files. The index currently contains only the deletion of `envs.txt`; no added staged contents were found.
- Standardized synthetic database-password examples in staging tests and the deployment guide to explicitly marked dummy values.

Before any future commit, inspect `git status`, explicitly stage reviewed paths, and run `node scripts/check-secrets.mjs --staged`. CI does not prevent an unchecked local commit or erase a secret already pushed.

## Prepared history-cleanup procedure

1. Preserve and review the existing uncommitted stabilization work first. Do not reset or rewrite this checkout while its changes are pending.
2. Coordinate a maintenance window with repository collaborators and identify all remote branches/tags. Local refs alone do not establish the complete remote inventory.
3. Use a maintained history-filtering tool in an isolated mirror to remove `envs.txt` from every affected branch/tag; do not embed replacement passwords/keys in command arguments or replacement-text files.
4. Scan rewritten history for the known historical credentials, compare retained source trees, and inspect affected refs before publishing anything.
5. Coordinate the remote history replacement and fresh collaborator clones. Address hosting caches/forks separately. Do not restore old refs from a stale clone.

No history rewrite, force push or secret-containing recovery archive has been performed. Credential revocation is already independently verified and remains the primary protection against retained old copies.

## Remaining limits

- `envs.txt` is removed from the current Git index, but its historical committed copy still contains old credentials. Removing tracking does not remove history or revoke credentials. Historical cleanup remains outstanding.
- Replacing an encryption key cannot revoke the old key or prevent decryption of retained old ciphertext. Current development ID fields now use the new key; backups, remote deployments and other retained copies were not inventoried.
- No remote deployment secret store was updated or verified. A separately running/deployed API needs coordinated configuration before it can read the newly encrypted development fields. The configured local API port was checked as inactive before rotation.
- No real financial transaction, production deployment, schema migration, Git commit or history rewrite was performed in this remediation.
- Never paste the replacement key into chat, documentation or logs. Keep real credentials in ignored environment files or approved platform secret stores. Git ignore rules are not encryption or access control.
