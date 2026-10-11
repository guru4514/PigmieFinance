# Staff read authorization — 2026-10-11

## Threat and failure analysis before implementation

1. Access: authenticated staff with provider MFA still pass existing guards; list/detail services must resolve the current active actor again.
2. Scope: only current organization administrators or branch managers may read the staff directory. Managers must have a branch and may read only that branch.
3. Forgery: actor ID comes from authentication, while branch filters may only narrow administrator results. A manager cannot broaden access by sending another branch or relying on an earlier administrator role.
4. Malicious clients: preserve validated pagination/status/role queries; service scope is authoritative for detail and list reads.
5. Direct database access: keep explicit organization predicates. Backend privileged-role isolation remains a broader release item.
6. Secrets: retain public field selection; never return stored MFA secrets or print provider credentials.
7. Expiry: the existing authentication guard checks provider sessions; current inactive, foreign or demoted directory actors must fail inside the read transaction.
8. Concurrency: take a shared lock on the actor before resolving its current role and branch. Concurrent actor changes serialize with directory authorization. Do not lock target rows after the actor, which could conflict with ordered mutation locks. Directory membership/counts remain a read-committed snapshot and may change between queries.
9. External failure: no provider calls or messages are required; database errors must not fabricate an empty successful directory. Use disposable staging fixtures, verify actual overlapping permission changes, and remove them afterward.

## Results

Implemented service-level directory authorization without a caller-provided role flag. The controller supplies the authenticated actor ID. Both list and detail reads take an actor shared lock, then resolve its current active organization membership, role and branch. Detail queries include branch scope directly; manager list filters cannot replace it. Administrators retain organization-wide reads and optional narrowing filters. Public staff field selection is unchanged.

- Focused staff suite passed: 24 tests. Coverage includes directory denial for missing/inactive/foreign/demoted actors, branchless managers, forged manager filters, inaccessible details and administrator filters.
- Full backend suite passed: 275 tests in 23 suites. Production build and focused lint for the three staff files passed. The final working-file secret scan checked 404 files with zero blocked matches; diff whitespace checks passed.
- The staging provisioning script passed against the real database/provider. PostgreSQL lock waits confirmed overlapping actor deactivation with a directory list, demotion with a detail read, and manager branch reassignment with an old-branch detail read. The first two were denied; the moved manager received 404 for the old-branch target.
- Forged manager filters returned only the current branch; valid assigned detail reads worked before reassignment, and the administrator directory continued to include both branches. Stored MFA secrets were absent from selected records.
- Existing provisioning compensation, notification ownership/SMS scope and staff mutation race checks also passed. All synthetic fixtures/provider accounts were removed; no mail, SMS or push was sent.

## Limits

Actor permission changes serialize with these reads; already-authorized responses cannot be retracted after a later change. Target directory membership and pagination totals use read-committed queries and are not an immutable multi-query snapshot. Privileged backend database isolation, provider crash reconciliation, storage authorization and other services remain release work. No production deployment or migration was performed.
