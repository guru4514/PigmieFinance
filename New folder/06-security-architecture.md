# 06 — Security Architecture

Financial records for many independent organizations live in this system. The two things that matter most, in order, are: **one organization can never see another's data**, and **every change to a loan or a collection is attributable and unerasable**. Everything below is organized around making both of those true by construction, not by convention.

## 1. Threat Model, Briefly

| Threat | Primary mitigation |
|---|---|
| One organization reading/modifying another's data | Postgres RLS as a load-bearing control (`03-database-schema.md §5`), not just app-layer checks |
| Stolen/leaked staff or customer credentials | Supabase Auth (bcrypt hashing, secure session handling) + TOTP 2FA for staff + short-lived JWTs |
| A field agent's device lost/stolen | JWT expiry (5 min access token default, refresh required), device-level app lock is the org's own device-management policy (out of scope for the app itself, noted so it isn't assumed away) |
| Tampering with historical financial records | Append-only `collections` (no UPDATE/DELETE policy at all) and `audit_logs`; corrections are additive, never destructive |
| Injection (SQL, XSS) | Prisma parameterized queries; React's default escaping; CSP headers |
| One noisy/abusive organization degrading service for others | Per-organization rate limiting (§7) |
| Leaked customer PII (ID numbers) | Field-level AES-256-GCM encryption at the application layer (§5), independent of database-level protections |

## 2. Authentication

Supabase Auth issues and manages every session — password hashing, session/JWT issuance, refresh, and password-reset email flows are all Supabase's responsibility, not hand-rolled here. This is a deliberate security upgrade over building auth from scratch: password hashing and session management are exactly the kind of code where a small mistake is catastrophic, and Supabase Auth is a mature, widely-audited implementation.

**JWT verification, on the backend side:** as of late 2025, new Supabase projects issue JWTs signed with an asymmetric key (ES256/RSA) by default, verifiable locally against Supabase's published JWKS — no round-trip to Supabase on every request. This is the pattern to use:

```typescript
// jwks-verifier.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

export async function verifySupabaseToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    audience: 'authenticated',
  });
  return payload; // payload.sub === auth.users.id
}
```

`jose`'s `createRemoteJWKSet` caches keys in memory and transparently re-fetches on a `kid` it doesn't recognize (i.e. on key rotation) — verify your specific project's signing configuration at `supabase.com/dashboard/project/_/settings/api` before relying on this exact flow, since a project could still be on the legacy shared-secret (HS256) scheme if it predates the asymmetric default or hasn't rotated.

**Login/logout/refresh/password-reset are not backend endpoints** — the frontend uses the Supabase JS client directly for all of these (`07-frontend-implementation-guide.md §3`). The backend's only job is verifying the token it's handed and resolving it into a Pigmie identity:

```typescript
// supabase-auth.guard.ts
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');

    let payload;
    try {
      payload = await verifySupabaseToken(authHeader.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const authUserId = payload.sub as string;
    const staff = await this.prisma.staff.findUnique({ where: { authUserId } });
    if (staff?.isActive) {
      request.user = { type: 'staff', id: staff.id, organizationId: staff.organizationId, role: staff.role };
      return true;
    }

    const customer = await this.prisma.customers.findUnique({ where: { authUserId } });
    if (customer?.isActive && customer.portalAccessEnabled) {
      request.user = { type: 'customer', id: customer.id, organizationId: customer.organizationId };
      return true;
    }

    // Valid Supabase session, no Pigmie profile yet — only POST /organizations
    // should accept this shape; every other guarded route rejects it.
    request.user = { type: 'unprovisioned', authUserId };
    return true;
  }
}
```

This guard is also where the multi-tenant database context gets set — immediately after resolving `organizationId` above, the request handler's Prisma transaction opens with `select set_config('app.current_org_id', $1, true)` before any business query runs. Full request-lifecycle detail is in `08-backend-implementation-guide.md §5`; this is the guard that produces the value that call needs.

## 3. Authorization (RBAC)

| Action | org_admin | branch_manager | agent | accountant | customer |
|---|:---:|:---:|:---:|:---:|:---:|
| Manage org settings | ✅ | | | | |
| Manage branches, loan products | ✅ | | | | |
| Create/manage staff accounts | ✅ | | | | |
| Create/edit customers | ✅ | ✅ | ✅ | read-only | — |
| Create loan application | ✅ | ✅ | ✅ | | |
| Approve / reject / disburse loan | ✅ | ✅ | | | |
| Record a collection | ✅ | ✅ | ✅ | | |
| Reverse a collection | ✅ | ✅ | | | |
| Write off a loan | ✅ | | | | |
| Restructure a loan | ✅ | ✅ | | | |
| View reports | ✅ (all) | ✅ (own branch) | ✅ (own customers) | ✅ (all, read-only) | |
| View audit log | ✅ | | | read-only | |
| View own loan / schedule / statement | — | — | — | — | ✅ |

Enforced with a decorator + guard pair, checked after `SupabaseAuthGuard` has already resolved `request.user`:

```typescript
// roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);

// roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<StaffRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true; // no @Roles() = any authenticated user is enough
    const { user } = context.switchToHttp().getRequest();
    if (user.type !== 'staff' || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for this action');
    }
    return true;
  }
}

// usage
@Post(':id/approve')
@Roles('org_admin', 'branch_manager')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@AuditAction('loan.approve')
approve(@Param('id') id: string, @CurrentUser() user: RequestUser) { /* ... */ }
```

A `branch_manager`'s scope is additionally narrowed to their own `branchId` inside the service layer (not expressible as a static role list), and the **light platform-admin capability** noted in the Phase 3 roadmap (`01-product-overview-and-scope.md §8`) is deliberately not a `role` value on `staff` at all — it's a separate, narrowly-scoped flag checked only on a small number of cross-tenant support endpoints, so it can never be accidentally granted through the normal staff-role assignment flow.

## 4. Password & Account Security

- **Hashing:** Supabase Auth's responsibility (bcrypt under the hood) — not reimplemented here.
- **2FA (staff only):** TOTP via `otplib`, RFC 6238, compatible with any standard authenticator app. Chosen over SMS OTP because there is no free SMS gateway (`01-product-overview-and-scope.md`, assumption 8) and because TOTP is inherently more phishing- and SIM-swap-resistant. The secret is generated server-side, encrypted at rest using the same `EncryptionService` as §5, and never transmitted again after initial setup (only the QR payload is shown once).
- **Login throttling:** handled by Supabase Auth itself, since login doesn't route through the Pigmie backend at all — Supabase's auth endpoints carry their own rate limits. Pigmie's backend adds the 2FA step-up check on top, once a base Supabase session exists.
- **Session length:** short-lived access tokens (Supabase default ~5 minutes) with silent refresh via the Supabase client SDK; a revoked/deactivated `staff` row is checked on every request (via the guard above), so deactivating a staff member takes effect immediately, not just at their next token expiry.

## 5. Data Protection

**In transit:** TLS everywhere, non-negotiably — Cloudflare Pages, Render, and Supabase all provide free, automatic TLS termination, so there's no configuration step where this could be accidentally skipped.

**At rest, two layers:**
1. Supabase's underlying storage encryption (provider-level, out of Pigmie's control but on by default).
2. **Application-level field encryption for the single most sensitive field in the schema** — `customers.id_proof_number_encrypted` — independent of the database provider, using AES-256-GCM with a 32-byte key held only in the backend's environment secrets (never in source, never in a client bundle):

```typescript
// encryption.service.ts
@Injectable()
export class EncryptionService {
  private readonly key = Buffer.from(process.env.PII_ENCRYPTION_KEY!, 'hex'); // 32 bytes

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]); // iv(12) + authTag(16) + ciphertext
  }

  decrypt(blob: Buffer): string {
    const iv = blob.subarray(0, 12), authTag = blob.subarray(12, 28), ciphertext = blob.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
```

`PII_ENCRYPTION_KEY` is generated once (`openssl rand -hex 32`) and stored only in Render's environment variable configuration. Losing it means losing the ability to decrypt existing ID numbers — back it up in a password manager or secrets vault outside the codebase entirely, not just in Render.

**Files (KYC documents, receipt photos):** never served from a permanently public URL. Uploaded via short-lived signed upload URLs and read via short-lived signed download URLs (both backend-brokered, `04-api-specification.md §6`), with Supabase Storage bucket policies additionally scoping access by `organization_id` the same way table RLS does.

## 6. Input Validation

Every request body is validated by a NestJS DTO with `class-validator` decorators before it reaches any service logic — invalid input never reaches Prisma:

```typescript
export class CreateCollectionDto {
  @IsUUID() clientGeneratedId: string;
  @IsUUID() loanId: string;
  @IsNumber() @IsPositive() amount: number;
  @IsDateString() collectionDate: string;
  @IsDateString() collectedAt: string;
  @IsEnum(CollectionMethod) collectionMethod: CollectionMethod;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}
```

Combined with Prisma's parameterized queries (no raw string-concatenated SQL anywhere in the codebase — the one exception, the RLS-helper `set_config` call, uses a parameterized `$queryRaw` tagged template, never string interpolation), this closes off SQL injection as a practical concern by construction rather than by discipline.

## 7. API-Level Protections

**Rate limiting, keyed by organization, not just IP** — the point made in `02-architecture-and-tech-stack.md §4`: a busy or misbehaving organization shouldn't be able to degrade the experience for every other organization sharing the same free-tier compute.

```typescript
ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60_000, limit: 300 }], // 300 req/min per key
  getTracker: (req) => req.user?.organizationId ?? req.ip, // org once authenticated, IP before that
});
```

**CORS:** locked to the exact Cloudflare Pages origin(s) in production — no wildcard `*`.

**Security headers:** `helmet()` applied globally in `main.ts` — sets `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, and friends with one line rather than hand-assembling each header.

**CSRF:** the API is a pure JSON REST API consumed via `fetch`/`axios` with a bearer token in an `Authorization` header — not cookie-based session auth — so classic CSRF (which relies on browsers automatically attaching cookies to cross-site requests) does not apply here. This is a property of the auth design, not an extra control bolted on; worth revisiting only if the app ever moves to cookie-based sessions.

## 8. Row-Level Security — Tie-Together

Full policy definitions and the `pigmie_app` role/`request_organization_id()` mechanism are in `03-database-schema.md §5`. The short version for this document: RLS is the **database-enforced backstop for tenant isolation** specifically, evaluated on every query regardless of which code path issued it, because the backend's Postgres role does not have `BYPASSRLS`. Role-based authorization (§3 above) is enforced in application code before a query runs, since Postgres has no way to know "is this agent allowed to approve a loan" — only "does this row belong to the caller's organization," which it always knows and always checks.

## 9. Audit Logging

Every state-changing endpoint carries an `@AuditAction('resource.verb')` decorator, picked up by a global interceptor rather than requiring a manual log call inside each service method (which would eventually get forgotten somewhere):

```typescript
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const action = Reflect.getMetadata(AUDIT_ACTION_KEY, context.getHandler());
    if (!action) return next.handle();
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap(async (result) => {
        await this.prisma.auditLogs.create({
          data: {
            organizationId: request.user.organizationId,
            actorStaffId: request.user.type === 'staff' ? request.user.id : null,
            action,
            entityType: action.split('.')[0],
            entityId: result?.id ?? request.params.id,
            newValue: result,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        });
      }),
    );
  }
}
```

`audit_logs` has no `UPDATE`/`DELETE` grant to any application role (`03-database-schema.md §5`) — it is genuinely append-only, including to `org_admin`.

## 10. Secrets Management

| Secret | Lives in | Never in |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` (Postgres) | Render environment variables | Source control, client bundle |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (admin operations like creating staff auth users) | Render environment variables, backend only | Frontend `.env` (frontend only ever gets the public anon key) |
| `PII_ENCRYPTION_KEY` | Render environment variables + a password manager backup | Source control |
| Frontend Supabase anon key + URL | Cloudflare Pages build-time env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) | — this one is intentionally public; the anon key is safe to expose by Supabase's own design, since RLS is what actually protects data, not secrecy of this key |

`.env.example` files (committed) document every required variable name with placeholder values; actual `.env` files are gitignored from the first commit.

## 11. Dependency & Vulnerability Management

GitHub's **Dependabot** (free, native to GitHub, no third-party service) is enabled on both repos for automated dependency update PRs and security-advisory alerts. `npm audit` runs as a step in the CI workflow (`09-deployment-and-testing-guide.md §7`) and fails the build on any `high`/`critical` advisory with an available fix.

## 12. Backup & Disaster Recovery

Detailed steps in `09-deployment-and-testing-guide.md §12`; summarized here: a scheduled GitHub Actions job runs `pg_dump` against the direct Supabase connection and pushes the encrypted dump to a private GitHub repo (or Cloudflare R2), on a schedule, retaining a rolling window. This exists independently of whatever backup Supabase's own plan tier includes, specifically because the free tier includes none.

## 13. OWASP Top 10 (2021) — Mapped

| Category | Pigmie's mitigation |
|---|---|
| A01 Broken Access Control | RLS (§8) + RBAC guards (§3) + per-request org scoping |
| A02 Cryptographic Failures | TLS everywhere, AES-256-GCM field encryption (§5), no plaintext secrets (§10) |
| A03 Injection | Prisma parameterized queries, `class-validator` DTOs (§6) |
| A04 Insecure Design | Tenant isolation and audit trail designed into the schema from the start (`03-database-schema.md`), not retrofitted |
| A05 Security Misconfiguration | `helmet()`, locked CORS, minimum-privilege `pigmie_app` grants |
| A06 Vulnerable/Outdated Components | Dependabot + CI `npm audit` gate (§11) |
| A07 Identification & Auth Failures | Supabase Auth + mandatory-for-staff TOTP 2FA + short JWT expiry (§2, §4) |
| A08 Software/Data Integrity Failures | Append-only collections/audit log, CI tests gate every deploy |
| A09 Logging & Monitoring Failures | `audit_logs` on every state change (§9), optional Sentry (`02-architecture-and-tech-stack.md §3`) |
| A10 Server-Side Request Forgery | No user-supplied URL is ever fetched server-side anywhere in this design — a constraint worth preserving deliberately if that ever changes |

*(2021 is the most recent full OWASP Top 10 revision at time of writing — check owasp.org for whether a newer edition has since been published before treating this table as current.)*

## 14. Compliance — Read This, Then Talk to a Lawyer

This is engineering guidance, not legal advice, and it stays that way deliberately. Lending is regulated in most jurisdictions, and storing customer PII (identity documents, phone numbers, addresses) triggers data-protection obligations wherever the customers are — in India, this spans both state-level money-lending rules and the DPDP Act 2023; elsewhere it might be GDPR or a local equivalent. What this document builds in are the technical building blocks a real compliance posture would need regardless of jurisdiction — encryption, access control, audit trails, data export, the ability to deactivate/anonymize a record — but confirming which specific obligations apply, and whether anything further (data residency, retention limits, a formal DPA) is required, needs a lawyer who knows the operator's actual jurisdiction and licensing situation. This is the one section of the whole documentation set this write-up won't try to be the final word on.
