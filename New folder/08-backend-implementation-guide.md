# 08 — Backend Implementation Guide

## 1. Recap

NestJS + TypeScript + Prisma, deployed to Render, connected to Supabase Postgres via a pooled connection using the non-RLS-bypassing `pigmie_app` role (`03-database-schema.md §5`). This document is where that design becomes actual request-handling code.

## 2. Module Structure

One NestJS module per resource, each with its own `controller.ts` (HTTP layer — routing, DTOs, guards, decorators only, no business logic), `service.ts` (business logic, the only layer allowed to reason about interest math, state transitions, or allocation rules), and `dto/` (request/response shapes with `class-validator` decorators):

```
src/modules/
  auth/            → GET /auth/me, 2FA setup/enable/verify (04-api-specification.md §2)
  organizations/   → POST /organizations, GET/PATCH /organizations/me, branches
  staff/
  customers/
  loan-products/
  loans/           → the state-machine endpoints (05-business-logic-and-calculations.md §6)
  collections/     → record, sync, reverse (the highest-traffic module)
  cash-deposits/
  documents/       → signed upload/download URL brokering
  reports/
  notifications/
  portal/          → customer-portal-scoped read endpoints, mirrors relevant staff endpoints with ownership checks
```

`common/` holds everything cross-cutting: guards (`SupabaseAuthGuard`, `RolesGuard` — `06-security-architecture.md §2–3`), the audit interceptor (§9 there), the exception filter (§4 below), and the tenant-context helper (§3 below). `jobs/` holds scheduled tasks (§7).

## 3. The Tenant-Scoped Query Pattern

This is the piece that makes `03-database-schema.md §5`'s RLS design actually work in practice — every database operation that should be tenant-scoped runs through one helper:

```typescript
// prisma/tenant-prisma.service.ts
@Injectable()
export class TenantPrismaService {
  constructor(private prisma: PrismaService) {}

  /**
   * Runs `fn` inside a transaction whose Postgres session is scoped to
   * `organizationId`, so RLS policies apply to every query fn makes.
   * Keep fn to database work only. Slow, non-DB work (PDF rendering,
   * external calls) belongs OUTSIDE this call, operating on data fn already
   * returned — holding a pooled connection open during slow unrelated work
   * starves the pool under real concurrent load, which is exactly the
   * failure mode to avoid at "many users" scale.
   */
  async run<T>(organizationId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
      return fn(tx);
    });
  }
}
```

A representative service method — disbursing a loan touches three tables and must be atomic, and it's also a good example of the "DB work inside, everything else outside" split:

```typescript
@Injectable()
export class LoansService {
  constructor(private tenantPrisma: TenantPrismaService, private notifications: NotificationsService) {}

  async disburse(organizationId: string, loanId: string, startDate: string, staffId: string) {
    const { loan, schedule } = await this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loans.findFirstOrThrow({ where: { id: loanId, organizationId, status: 'approved' } });
      const rows = generateSchedule({
        principal: loan.principalAmount, interestType: loan.interestType,
        annualRate: loan.interestRateAnnual, tenure: loan.tenure,
        frequency: loan.collectionFrequency, startDate,
      }); // pure function — 05-business-logic-and-calculations.md §3

      await tx.loanSchedule.createMany({
        data: rows.map((r) => ({ loanId, organizationId, ...r })),
      });

      const totalPayable = rows.reduce((sum, r) => sum + r.dueAmount, 0);
      const updated = await tx.loans.update({
        where: { id: loanId },
        data: {
          status: 'active', startDate, disbursedAt: new Date(), disbursedBy: staffId,
          installmentAmount: rows[0].dueAmount, totalPayable, outstandingBalance: totalPayable,
          expectedEndDate: rows.at(-1)!.dueDate,
        },
      });
      return { loan: updated, schedule: rows };
    });

    // outside the transaction: notification is a nice-to-have, not part of
    // the financial invariant, and definitely not worth holding a DB
    // connection open for if the notification write or a push send is slow
    await this.notifications.notify(loan.assignedAgentId, 'loan_disbursed', { loanId });
    return { loan, schedule };
  }
}
```

Note `where: { id: loanId, organizationId, status: 'approved' }` still explicitly includes `organizationId` in application code, even though RLS would independently block a cross-org read — this isn't redundant, it's the two layers from `02-architecture-and-tech-stack.md §4` doing their separate jobs: the explicit filter is correct, readable code; RLS is what still protects the outcome on the day someone forgets to write it.

**Endpoints with no organization yet** (`POST /organizations` itself, `GET /health`) don't go through `TenantPrismaService` — they use the base `PrismaService` directly, since there's no tenant to scope to before an organization exists.

## 4. Error Handling

One global filter produces the error envelope defined in `04-api-specification.md §1` from any exception, so no controller has to hand-build an error response:

```typescript
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const body = exception instanceof HttpException ? exception.getResponse() : null;

    response.status(status).json({
      error: {
        code: STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR',
        message: typeof body === 'string' ? body : (body as any)?.message ?? 'Internal server error',
        details: typeof body === 'object' ? body : undefined,
      },
    });

    if (status === 500) this.logger.error(exception); // full stack server-side; never leaked to the response body
  }
}
```

Domain errors (loan not in the right status for an action, insufficient role for a restructure, etc.) are thrown as NestJS's built-in `BadRequestException`/`ForbiddenException`/`ConflictException` from inside service methods — there's no separate custom exception hierarchy to maintain, since Nest's built-ins already map cleanly onto the HTTP status codes the API contract promises.

## 5. Request Lifecycle, End to End

Tying together pieces from this document and `06-security-architecture.md`, here's the full path of `POST /loans/:id/approve`:

1. `SupabaseAuthGuard` verifies the JWT against Supabase's JWKS, resolves the caller into `request.user = { type: 'staff', organizationId, role, id }` (`06-security-architecture.md §2`).
2. `RolesGuard` checks `@Roles('org_admin', 'branch_manager')` against `request.user.role`, rejecting with 403 if it doesn't match (`06-security-architecture.md §3`).
3. NestJS's `ValidationPipe` validates the request body (empty, for this particular endpoint) against its DTO.
4. The controller calls `loansService.approve(request.user.organizationId, loanId, request.user.id)`.
5. `LoansService.approve` calls `tenantPrisma.run(organizationId, ...)`, which opens a transaction, sets `app.current_org_id`, updates the loan row (RLS re-confirms the row belongs to this org regardless of what the service code filtered on), and returns.
6. `AuditLogInterceptor` (`06-security-architecture.md §9`), driven by the `@AuditAction('loan.approve')` decorator on the controller method, writes the audit row after the response value is available.
7. `HttpExceptionFilter` would have caught and formatted anything that went wrong at any step above; on the happy path, the controller's return value is serialized as the response body directly.

## 6. Background Jobs

NestJS's `@nestjs/schedule` module (a thin wrapper over `node-cron`, no external service, no third-party scheduler):

```typescript
@Injectable()
export class ScheduledJobsService {
  constructor(private prisma: PrismaService, private tenantPrisma: TenantPrismaService) {}

  @Cron('0 1 * * *') // once daily — see the timezone note below
  async markOverdueInstallments() {
    const organizations = await this.prisma.organizations.findMany({ where: { isActive: true } });
    for (const org of organizations) {
      await this.tenantPrisma.run(org.id, (tx) => runOverdueDetection(tx, org.id));
      // 05-business-logic-and-calculations.md §9 — looped per-organization
      // rather than one giant cross-org query, so RLS/session-scoping stays
      // correct for each org's pass and one org's data volume can't starve
      // the others' turn indefinitely inside a single unbounded query
    }
  }
}
```

**Timezone honesty:** this runs once at a fixed server time (UTC), and the overdue-detection logic compares against `current_date` as evaluated in that session. Organizations in different timezones (`organizations.timezone`) could, in principle, have their "day boundary" a few hours off from local midnight. For v1 this is an accepted simplification, not an oversight — genuinely correct per-timezone midnight execution would mean either running the job multiple times a day and filtering by timezone, or a per-org scheduled trigger, both of which are real complexity for a discrepancy that amounts to, at most, applying a late fee a few hours earlier or later than local midnight. Worth revisiting only if organizations spanning many timezones actually sign up.

## 7. Logging

Structured JSON logs (Nest's built-in `Logger`, or swap for `pino` if request volume ever makes synchronous console logging a bottleneck), every log line carrying a request-correlation ID (generated per request if the `x-request-id` header isn't already present, threaded through via `AsyncLocalStorage` so nested service calls don't need it passed as a parameter everywhere). **Never logged, ever, ordered by how bad it would be:** raw JWTs, the `PII_ENCRYPTION_KEY`, decrypted `idProofNumber` values, full request bodies on auth endpoints. A small `redact()` helper is applied to any object before it's logged, stripping known-sensitive keys by name as a safety net beyond just "remembering not to."

## 8. Testing

**Unit tests (Jest):** the pure functions in `05-business-logic-and-calculations.md` are the highest-value unit tests in the codebase, and the worked examples in that document aren't just documentation — they're literally the expected values:

```typescript
describe('generateSchedule — reducing balance', () => {
  it('matches the documented worked example', () => {
    const rows = generateSchedule({
      principal: 10_000, interestType: 'reducing_balance', annualRate: 0.24,
      tenure: 10, frequency: 'monthly', startDate: '2026-09-01',
    });
    const installmentAmount = rows[0].dueAmount;
    expect(installmentAmount).toBeCloseTo(1113.32, 1);
    expect(rows.reduce((sum, r) => sum + r.dueAmount, 0)).toBeCloseTo(11_133.20, 1);
  });
});
```

**Integration tests (Jest + a real test Postgres):** run against a disposable database (Docker Postgres locally and in CI, or a dedicated free Neon/Supabase project reserved for tests) with the actual migrations, including RLS policies, applied. The single most important test class in the whole suite verifies tenant isolation directly, at the database layer — not just "does the service filter correctly," but "does the database still say no even if the service didn't":

```typescript
describe('tenant isolation (RLS)', () => {
  it('blocks reading another organization\'s customer even via a query with no organizationId filter', async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const customerInA = await createTestCustomer(orgA.id);

    const rows = await tenantPrisma.run(orgB.id, (tx) =>
      tx.customers.findMany({ where: { id: customerInA.id } }) // deliberately no organizationId in the WHERE
    );

    expect(rows).toHaveLength(0); // RLS, not the query, is what makes this pass
  });
});
```

This test class runs for every business table, not just `customers` — it's the automated proof that `03-database-schema.md §5`'s design decision actually holds, and it's required to pass before any deploy (§7 of the deployment guide wires this into CI).

**E2E (Playwright):** a small number of full-stack flows against a real deployed preview environment — sign up → create organization → create customer → create and disburse a loan → record a collection → view it in the customer portal. This is the test suite that catches "the frontend and backend agree about a field name" class of bugs that unit and integration tests, run separately, structurally cannot.
