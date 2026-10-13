# Runtime database access inventory

Reviewed 14 October 2026 against application source and migrations 0001–0008. This document records the design input for the runtime-isolation increment; it does not claim that the rollout is already verified. This is improvement-plan backlog 10, dependent on schema and financial stabilization.

Subsequent execution: migration 0009 and restricted runtime logins are now verified in development/staging, with original rows/history preserved. The inventory below remains the before-change design record. Actual verification and hosted deployment limits are in [runtime rollout](RUNTIME_ROLLOUT_VERIFICATION.md); the API retains its server-side provider key for scoped Auth Admin/Storage operations and is not claimed to have an isolated provider broker.

## Existing direct database access

| Source and operation | Tables/operations | Required context and replacement |
| --- | --- | --- |
| `src/prisma/prisma.service.ts`, constructor and lifecycle | Connection, connectivity | Runtime connection must authenticate as a dedicated nonowner, non-superuser, non-BYPASSRLS role. Migration/backup credentials must not be loaded by the web process. Validate role and ownership at startup; do not rely on a request-time `SET ROLE` from an owner connection. |
| `common/guards/supabase-auth.guard.ts`, `canActivate` | Reads session/user/factor existence; reads staff/customer by verified Auth UUID | Narrow provider-session validation and identity lookup before tenant discovery. JWT verification, expected role, UUID and session checks precede the database call. Return only booleans and application identity fields. No general Auth-table grants or provider metadata returned to callers. |
| `modules/auth/auth.service.ts`, `getMe` | Staff/customer SELECT; own loan COUNT | Tenant transaction from `RequestUser.organizationId`; retain own id/customer predicates and minimal output. |
| Same, custom `setup2FA`, `enable2FA`, `verify2FA`, `disable2FA` | Staff SELECT/UPDATE | Tenant transaction. Setup/enable/verify routes are retired with HTTP 410, but the service methods still exist and disable/reset remains callable. Admin override must recheck active administrator in the same transaction. Custom secrets never authorize a provider session. |
| Same, `logLoginEvent` | Audit INSERT | Tenant transaction; unprovisioned returns without insertion. Generic audit failure must remain visible and sanitized. |
| `common/interceptors/audit-log.interceptor.ts` | Audit INSERT after handler succeeds | Tenant transaction. Onboarding audit derives organization id from successful result; this is necessary because the incoming principal was unprovisioned. Keep metadata-only payload and current best-effort failure reporting. Required financial audits already belong inside their business transaction. |
| `modules/organizations/organizations.service.ts`, `createOrganization` | Auth-user eligibility/email SELECT with row lock; membership SELECT; org/branch/admin INSERT | Dedicated onboarding operation. Lock the verified identity, reject existing staff/customer membership globally, check confirmed/nonbanned/nonprovisioning identity and email equality, then atomically create organization, branch and initial administrator. Do not expose unrestricted organization INSERT or permit client-selected tenant context to satisfy this exception. |
| `modules/staff/provisioning-reconciliation.service.ts`, `inspect`, `eligible`, `reconcile` | Global Auth candidate SELECT and global staff/customer membership absence; advisory transaction lock | Narrow recovery function with global visibility, age/UUID/provider marker filters and bounded output. Recheck candidate under the existing advisory lock immediately before provider deletion. Ordinary tenant RLS would hide another organization's membership and could incorrectly delete a live provider identity. No broad Auth or all-staff SELECT exemption. |
| `modules/jobs/scheduled-tasks.service.ts`, `markOverdueInstallments` | Global active organization id enumeration; loan SELECT; scoped schedule/loan UPDATE and audit INSERT | Narrow active-org-id enumeration function only. Move candidate loan listing into `tenantPrisma.run`; all existing loan locks, per-loan rechecks, financial updates and required audit writes remain tenant scoped. A database runtime role must not grant global business rows merely for job discovery. |
| `modules/notifications/notifications.service.ts`, `notify` | Direct push-subscription SELECT and expired-subscription DELETE | Both operations must run in the supplied organization transaction. Push subscription has Auth UUID rather than organization id; policy must resolve membership in the current organization. Subscription keys are secret delivery credentials and must never appear in logs. Perform network send outside database transactions; conditionally remove exactly the same stale subscription afterward. |
| `modules/health/health.service.ts`, `check` | `SELECT 1` | No tenant required. Startup role assurance is separate from connectivity. |
| `modules/collections/collections.service.ts`, `modules/cash-deposits/cash-deposits.service.ts` | No actual direct `this.prisma` use | Constructor injections are unused and may be removed; business operations already use TenantPrismaService. |

There is no separate JWT strategy using Prisma: token verification is in `common/utils/jwks-verifier.util.ts` and identity discovery in the guard above. `customer-pdf.service.ts` and `loans/pdf.service.ts` name their injected object `prisma`, but it is TenantPrismaService, not a direct client.

## Already scoped services and policy requirements

Staff, customer provisioning, portal, documents, approvals, loan products, loans, collections, deposits, reports, audit reads, PDF reads and ordinary notification CRUD use `tenantPrisma.run`. Keep explicit organization/actor/customer predicates: organization RLS is a tenant boundary and does not replace agent assignments, branch permissions, customer ownership, MFA or transaction-level locks.

| Relation | Scoped operations required by source |
| --- | --- |
| organizations | SELECT/UPDATE; onboarding INSERT only through its dedicated path |
| branches, staff, customers, loan_products | SELECT/INSERT/UPDATE; preserve soft deletion and authorization |
| loans | SELECT/INSERT/UPDATE; no runtime hard deletion |
| loan_schedule | SELECT/INSERT/UPDATE; DELETE needed when replacing a schedule during an authorized restructure; parent-loan tenant policy |
| collections | SELECT/INSERT/UPDATE; UPDATE needed to attach immutable allocation evidence and for verification/reversal transitions |
| cash_deposits | SELECT/INSERT/UPDATE |
| documents | SELECT/INSERT/DELETE; metadata DELETE is used by authorized document deletion |
| notifications | SELECT/INSERT/UPDATE |
| push_subscriptions | SELECT/INSERT/UPDATE/DELETE; derive tenant from staff/customer Auth membership, since no organization column exists |
| approval_requests | SELECT/INSERT/UPDATE; quoted `organizationId` column |
| audit_logs | SELECT/INSERT only; no UPDATE/DELETE privileges or policy |
| loan_amendments | SELECT/INSERT only; immutable evidence triggers remain authoritative |

Migrations 0001–0008 enabled RLS on push_subscriptions and approval_requests without adding runtime policies. Collections has no UPDATE policy, loan_schedule no DELETE policy, and documents no DELETE policy. These worked under owner access and will fail under an honest runtime login until explicitly repaired. Existing blanket `pigmie_app` table/default grants must be narrowed, particularly migration history, archived history and future tables.

## Privileged exception design

Prefer fixed-operation SECURITY DEFINER functions over general provider-schema grants. Each function must use schema-qualified objects, a fixed safe search_path, validated UUID inputs, bounded outputs and parameterized predicates; revoke EXECUTE from PUBLIC/browser roles and grant only the runtime role. A definer must not accept arbitrary SQL, table names, modes that disable RLS, or arbitrary tenant switching. Its owner may be privileged, but its credential is absent from the API. Session/identity functions return only the current verified principal's necessary identity state. Organization enumeration returns ids only. Provisioning recovery returns only eligible markers and does a locked fresh absence check.

For onboarding, a single fixed function can own all eligibility/membership checks and three application inserts; alternatively, a narrow identity-eligibility function can retain the Auth row lock for a transaction, followed by tightly constrained onboarding policies. A generic `runIdentity` that exposes unrestricted Auth CRUD or sets an identity claimed by a request body is not adequate. Provider membership constraints must apply globally despite RLS.

Current `request_organization_id()` first calls SECURITY DEFINER `current_staff_org_id()` and falls back to `app.current_org_id`. Runtime tenant context should be deterministic and transaction-local. Do not persist connection-level identity/tenant settings in a pooled session; clear or isolate any session-derived compatibility path. A supplied verified UUID in an API operation remains an API trust boundary: database exceptions cannot themselves prove that JWT signature verification occurred.

## Provider separation and verification gates

Staff/customer provisioning calls Supabase Auth Admin over HTTP; document/evidence operations call Storage with the server key. These are separate capabilities from SQL runtime access. The server provider key can still bypass provider policies and therefore needs explicit application permission/path checks and must not be used for general Data API business CRUD. Fully removing provider-wide credentials from the web process would require a dedicated provider broker or isolated worker, not merely changing PostgreSQL credentials.

Verification must use the actual runtime login, not an owner emulating it: prove cross-tenant denial, empty unscoped reads, scoped CRUD and joins, immutable audit/amendments, fresh onboarding, actual provider-session/MFA checks, provisioning compensation under racing membership changes, push account isolation and job discovery followed by scoped processing. Assert the runtime is not owner/superuser/BYPASSRLS and cannot become a privileged role, read private migration history, mutate schema, read arbitrary Auth rows, or invoke privileged functions as a browser role. Rehearse migration against an isolated restore, compare source records, then migrate staging before development. Retain sanitized evidence and never print connection strings, provider rows or raw errors.
