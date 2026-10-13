# Runtime database isolation

## Threat review before implementation

1. Access: only the dedicated backend runtime login receives application grants. Browser roles retain no business-table privileges. Migration ownership remains separate.
2. Modification: explicit grants and tenant policies restrict writes to the transaction's organization. Audit and amendment records permit SELECT/INSERT only; their existing evidence triggers remain authoritative.
3. Forged requests: the API verifies JWT, active provider session, MFA and actor permissions before establishing transaction context. Database policies provide tenant defense in depth, not a replacement for those checks.
4. Malicious clients: clients cannot select a database role or transaction context. Organization context must come from the authenticated server identity, never a client organization claim alone.
5. Direct queries: the runtime role is neither owner nor superuser, has no BYPASSRLS and no role memberships. Queries without organization or verified identity context return no business rows. Direct browser grants remain revoked.
6. Secrets: the migration contains no login password. A separate guarded provisioning tool must generate/store credentials only in ignored environment configuration and never print them. No access to Auth/Storage tables is granted.
7. Expiration: identity bootstrap checks provider session validity first; transaction-local context cannot survive commit/rollback or be reused by a pooled connection.
8. Concurrency: existing financial row locks, idempotency and immutable evidence triggers remain in place. Policies use the same scoped transaction, including trigger-issued loan updates.
9. Failure: missing context denies access; policy or privileged-function failures roll back. Configuration checks must reject owner/bypass runtime connections before serving requests.

## Policy contract

The runtime role begins NOLOGIN and is activated only by secure provisioning after role attributes, ownership, memberships, migration history and the current runtime identity have been checked. `pigmie_app`, the historical placeholder login, is disabled during the verified cutover.

`app.current_org_id` scopes normal operations. `app.current_auth_id` provides read-only staff/customer identity bootstrap; it does not allow staff self-update or cross-organization modification. The API must perform MFA/profile writes in a scoped tenant transaction. Push-subscription access is limited to the current verified identity or identities belonging to the current organization.

Security-definer functions needed for provider-session validation, initial onboarding and bounded scheduler organization enumeration must have fixed search paths, fixed statements, restricted return fields and runtime-only EXECUTE privileges. A broad privileged Prisma client is not a permitted substitute.

The migration implements four such functions:

- `runtime_provider_session(auth UUID, session UUID)` requires matching transaction identity context and returns three boolean flags for exactly that session/identity pair. Missing or mismatched identity returns no rows; it cannot enumerate provider records.
- `runtime_onboarding_identity(auth UUID)` requires matching transaction identity plus `app.onboarding_mode = '1'`, locks that Auth row, and checks staff/customer membership globally without exposing unrelated identities.
- `runtime_active_organization_ids()` returns active organization IDs only, for scheduler tenant iteration.
- `runtime_provisioning_candidates(candidate UUID, attempt UUID)` returns at most 100 old, marked, globally unlinked candidates. Exact candidate rechecks require both IDs; one missing argument fails closed.

Initial organization INSERT additionally requires the server-generated organization ID to equal transaction context, verified identity context to be present and explicit onboarding mode. Historical unconditional organization insertion is removed. Public schema creation is revoked from PUBLIC so a login cannot inherit schema creation accidentally. The new role receives no future-table/default sequence grants.

## Verification status

Migration 0009 is applied in development and staging with exact migration checksums and unchanged original records/history. Restored-copy and live rollback rehearsals, missing-context denial, two-tenant isolation, browser denial, onboarding/session bounds, pooled-context cleanup and actual restricted TLS logins passed. Staging financial/provisioning service integration and compiled API MFA HTTP flows passed with synthetic cleanup verified. Compiled development startup also passed its read-only runtime privilege check. See [rollout evidence](RUNTIME_ROLLOUT_VERIFICATION.md). Existing hosted API deployments still require the new runtime secret and verified build restart; this evidence does not establish deployment there.
