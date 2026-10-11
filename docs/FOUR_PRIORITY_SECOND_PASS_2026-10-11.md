# Four priorities — second stabilization pass

These are verified increments, not completion of all four packages or production approval. All staging business fixtures were synthetic and removed with cleanup verified. No development schema/history change, production deployment or public push was performed.

## 1. Schema reconciliation

The temporary-schema rehearsal passed: 30 foreign-key update-action corrections, two index definitions restored, 24 simulated index names restored, balances preserved, direct client privileges denied and rollback verified. See DEVELOPMENT_SCHEMA_RECONCILIATION.md for its limits. Development's original migration checksum still cannot be reconstructed. The foreign-key behavior decision, policy/function/enum comparison, backup restore and reviewed baseline adoption remain gates before development changes.

## 2. Cash reconciliation

Reconciliation now uses Decimal arithmetic and a repeatable-read transaction for opening balance, selected-period movement and closing balance. Inactive staff and other staff with cash records remain visible within current manager branch scope. An empty period no longer hides cash carried from earlier periods. Existing period totals/difference fields are preserved. Nested atomic service calls retain their outer transaction and do not upgrade its isolation level.

A separate authorized staff member must review a handover; backend rejection is enforced even if the browser is bypassed. Accountants can read handovers but cannot verify them. The web page now uses actual API fields, India business dates, selected-period verified totals and opening/closing rows, and hides self-verification actions.

Live staging verified a ₹55 collection less a ₹10 verified handover leaves ₹45 opening/closing in the following empty period, still visible after the collecting staff account is disabled. Self-verification was denied. Existing duplicate posting, reversal, settlement rollback, authorization, required audit and private evidence checks also passed.

The report explicitly uses current record statuses by business date. It is not a historical as-of ledger or proof of physical cash. Later reversal/verification can change earlier balances; legacy opening balances, dated correction entries, fee contracts, fee bases and principal/interest history remain open. Current branch assignment controls visibility; historical branch attribution is not introduced.

## 3. Storage access

Applied `pigmie_private_evidence_api_only` only in staging: a restrictive storage.objects policy for anon/authenticated denies the collection-photos and kyc-documents buckets. The reusable checker verifies RLS, direct-role reads and insert denial with synthetic claims. Existing signed upload/download and owned registration retries still passed after application. This is role-level verification, not a real user/session/device exercise.

Historical public objects, old public bucket closure, orphan cleanup, URL-only queue recovery and development storage remain open. Backend service credentials bypass RLS; API authorization and eventual least-privilege runtime remain essential. Already-issued signed grants remain bearer capabilities until expiry.

## 4. Backup safety and operational recovery

The backup script no longer puts the database URL/password in process arguments, echoes dump stderr, prints provider responses or prints raw exceptions. A dedicated helper decodes connection values into a restricted child environment, excluding application/storage encryption secrets and requiring certificate/hostname verification. Unsupported connection options and client certificate configurations fail closed. `BACKUP_CA_PATH` can select a trusted CA; otherwise the bundled Supabase CA is used.

Dump, encryption pipeline and upload failures stop the child, abort upload and attempt removal of that run's failed object. A one-hour timer interrupts stalled dump/upload work. Cleanup failure produces a fixed diagnostic. This is not proof of completed cleanup under every external-service failure.

The existing IV-prefixed AES-CBC format is preserved for compatibility. It lacks authenticated encryption and must not be described as integrity-protected. A versioned authenticated format plus compatible restore tooling remains necessary. The script expects platform-injected environment variables; no real backup/upload was attempted. PostgreSQL dump/restore tooling and a disposable restore target, object-store configuration, database/auth/storage recovery and real-device offline/MFA exercises remain unverified.

## Threat review

1. Access: existing API authentication/MFA admission plus current staff role/tenant checks apply. Reconciliation is administrator/manager/accountant read access; review is administrator/manager only.
2. Modification: handovers remain tenant scoped and locked; self-review is denied. Storage policy changes are fixed staging-only tooling. Schema simulation rolls back.
3. Forged requests: backend role/tenant/date/amount checks remain mandatory; no new external URL-fetch operation is added.
4. Malicious clients: hiding buttons is supplementary; service checks reject self-review and forbidden roles. Reconciliation fields do not grant write access.
5. Direct database access: browser evidence roles are restricted in staging. Privileged backend roles still bypass RLS; broader least privilege is unresolved.
6. Secrets: backup arguments/logs suppress credentials and raw diagnostics; dump child receives only connection values plus selected OS environment. Upload credentials remain in the parent process. Examples/tests use dummy values.
7. Expired authentication: existing provider-session checks govern API admission. Issued signed grants expire independently; these changes do not cancel already-admitted requests.
8. Concurrency: handover row/actor locks remain; reconciliation uses one repeatable-read snapshot. Nested atomic contexts retain outer isolation. Rehearsal and policy verification use transactions.
9. External failures: evidence remains queued under existing outbox retry behavior; backup failures abort and attempt cleanup without leaking diagnostic content. Device recovery, orphan removal and full restores require separate evidence.

## Verification

363 backend tests in 31 suites and 66 web tests in 7 files passed. Both application builds passed; the backup script separately type-checked. Focused backend lint passed; web lint had zero errors and five existing warnings. The existing web bundle-size warning remains. The initial sandboxed backend run could not connect to localhost; the complete rerun with localhost access passed. Live staging financial/storage verification passed with synthetic fixtures removed. Working/index secret scans and local commit status are recorded at checkpoint completion; these changes have no new GitHub CI result yet.
