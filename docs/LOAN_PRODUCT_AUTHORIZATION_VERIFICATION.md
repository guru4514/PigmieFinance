# Loan-product write authorization — 2026-10-11

## Implemented increment

Improvement backlog 04 is partially addressed. Create, update and deactivate now lock the requesting staff row and reload active organization-administrator authority inside the same transaction as the write. Bound, tenant-scoped SQL locks hold role and activation stable until commit. Controller authentication and role guards remain in place.

Update and deactivate also lock the tenant-scoped product before reading it. Partial amount/tenure edits are validated against that locked record. Concurrent updates can no longer both validate against obsolete bounds and commit an invalid range. Final updates include the organization predicate. No migration, fee policy, existing loan terms or frontend behavior changed.

## Verification evidence

- Backend build passed; full backend regression suite passed: 347 tests in 29 suites.
- All 12 new focused cases passed, including absent/revoked administrator denial on all mutations, scoped lookup, missing/foreign product denial and partial bounds validation.
- Read-only ESLint of both changed TypeScript files passed after test mock types were corrected.
- Synthetic staging script `pigmie-api/scripts/check-staging-loan-products.mjs` passed against the fixed staging project. Configuration validation rejects the development target; environment values remain in memory and diagnostics omit provider responses and credentials.
- A separate PostgreSQL connection attempted administrator demotion while a product write transaction remained open. It failed with the specific PostgreSQL lock-timeout code `55P03`; the administrator role stayed unchanged.
- Concurrent minimum-increase and maximum-decrease requests that are incompatible together produced one successful update and one HTTP 400 rejection. Stored minimum remained at most maximum.
- A committed administrator demotion caused all three product mutations to return HTTP 403 without creating or deactivating a product.
- All newly created synthetic organization, staff and product fixtures were removed; cleanup was verified. No existing business records or provider identities were altered.

## Threat review

1. Access requires authenticated staff; product mutations require current active administrator authority in the target organization.
2. Writes target only the scoped product; deactivation retains the record and existing loan history.
3. Forged staff/product identifiers cannot remove tenant predicates. SQL values are bound parameters.
4. Client-provided role assumptions cannot replace the database authorization check. Existing DTO validation still applies.
5. The backend database role remains privileged. This change does not establish runtime least privilege or prevent independent direct database access.
6. No new secrets or customer fields are exposed. Verification prints fixed checkpoint names and sanitized codes.
7. Provider session checks remain at request admission. The staff lock serializes role/activation changes, but does not cancel an admitted transaction on subsequent provider logout.
8. Lock order is actor first, product second. Product edits serialize; staff role/activation updates wait for an open authorized write or complete before its current-role lookup. Database timeouts still apply.
9. Database errors roll back the product write. These service operations make no new external-provider calls.

## Remaining scope

This increment does not complete backlog 04: audit reads, other actor/scope paths, full cross-workflow lock review and session-revocation semantics remain open. Development schema/history reconciliation (03), private collection evidence (05), contractual fee snapshots and financial auditing remain separate work. Generic post-operation audit capture is unchanged and is not claimed to be atomic. No production deployment or release approval is established by these results.
