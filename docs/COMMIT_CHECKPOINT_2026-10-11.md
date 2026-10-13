# Stabilization commit checkpoint — 11 October 2026

Purpose: preserve the current engineering and research work before the next implementation phase. This checkpoint is not a production release or approval to deploy. See [release blockers](RELEASE_CHECKPOINT.md) and [improvement plan](PIGMIE_FINANCE_IMPROVEMENT_PLAN.md).

## Verification rerun for this checkpoint

- Backend: all 335 tests in 28 suites passed; Nest build passed.
- Web: all 62 tests in 7 files passed; TypeScript/Vite/PWA build passed.
- Secret-detector and staging-configuration checks: all 14 tests passed.
- Read-only lint of changed/new backend TypeScript: zero errors, two warnings in main.ts and pdf.service.ts. Web lint: zero errors, five existing warnings. The web bundle-size warning remains.
- The first backend run failed on 17 localhost HTTP tests because the sandbox denied socket connections. The authorized rerun passed all 335 tests; no test or permission assertion was weakened.
- No live database migrations, production deployment, credential rotation or customer financial operation was performed for this commit preparation. Prior synthetic staging evidence is recorded separately; it was not rerun here.

The final staged-file secret scan is required before each commit. Detection reports categories and paths only; it is not proof that every possible credential format is covered, and it does not clean older Git history.

## Included work

1. Repository hygiene: stop tracking the old credential document and generated TypeScript build state; retain secret ignore rules; use one complete-file secret detector for CI and the staged-file hook, with fail-closed error handling. The legacy JavaScript checker entry point delegates to the same detector.
2. Coupled application stabilization: authorization/MFA/session handling, financial posting/reversals/approvals, scoped staff/customer/document/report paths, provisioning recovery, notification safeguards, browser outbox/cache handling, regressions, additive migrations and isolated staging tooling. Remaining gaps are explicitly retained in the release checkpoint.
3. Verification records, dependency findings, India viability research and the phased improvement plan.

The additive migrations are preserved as reviewed source. Deployment-schema reconciliation still needs its documented safe procedure; committing a migration does not apply it.

## Deliberately excluded

- Real environment settings, database passwords, API secrets, encryption keys, provider credentials and private keys.
- Dependencies, build output and local TypeScript incremental state. The build-state file remains locally available after removal from Git tracking.
- Local verification screenshots, which have not been reviewed for publication. Their historical filenames in verification notes refer to local evidence, not attachments included in this Git checkpoint.

The Supabase CA certificate is public trust material used for verified TLS, not a private key. Schema-only reference SQL contains no customer rows or connection credentials.

## Publication and follow-up

Use the dedicated stabilization branch and a draft pull request against main; do not merge or deploy this checkpoint automatically. The next implementation work should start from this reviewed baseline and remain in separately reviewable increments.

GitHub CI must be checked after publication. Old secret-bearing Git history, remaining dependency advisories, runtime database privilege, private collection evidence, financial/job reconciliation and actual-device offline/recovery gates remain open. Deleting the old credential document from the current tree does not erase it from past commits or external copies.

To enable the staged-file hook in another checkout, configure Git's hooks path to `.githooks`. CI independently scans the checked-out repository and exercises the detector tests.
