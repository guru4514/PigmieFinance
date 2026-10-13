import { ExecutionContext, Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AUDIT_ACTION_KEY } from '../decorators/audit-action.decorator';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { Prisma } from '@prisma/client';

const org = '46634540-2c2b-42e7-b708-06b2d9a4d774';
const id = '7ead1e04-8fe6-4339-8494-9e955ad64df6';
function harness(action: string | undefined = '2fa.setup') {
  const handler = () => undefined;
  if (action) Reflect.defineMetadata(AUDIT_ACTION_KEY, action, handler);
  const request = {
    user: { type: 'staff', id, organizationId: org },
    params: { id },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'synthetic' },
  };
  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const create = jest
    .fn<Promise<{ id: string }>, [Prisma.AuditLogCreateArgs]>()
    .mockResolvedValue({ id });
  const run = jest.fn(
    (
      _org: string,
      action: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      action({ auditLog: { create } } as unknown as Prisma.TransactionClient),
  );
  const interceptor = new AuditLogInterceptor({
    run,
  } as unknown as TenantPrismaService);
  return { context, create, interceptor, request, run };
}
describe('Registered generic audit capture', () => {
  it('records action/actor/entity metadata without secrets, tokens or personal data', async () => {
    const h = harness();
    const response = {
      id,
      secret: 'SYNTHETIC_SECRET',
      uri: 'otpauth://synthetic',
      access_token: 'SYNTHETIC_TOKEN',
      fullName: 'Synthetic Person',
    };
    expect(
      await firstValueFrom(
        h.interceptor.intercept(h.context, { handle: () => of(response) }),
      ),
    ).toBe(response);
    expect(h.run).toHaveBeenCalledWith(org, expect.any(Function));
    expect(h.create).toHaveBeenCalledWith({
      data: {
        organizationId: org,
        actorStaffId: id,
        action: '2fa.setup',
        entityType: '2fa',
        entityId: id,
        newValue: { outcome: 'succeeded' },
        ipAddress: '127.0.0.1',
        userAgent: 'synthetic',
      },
    });
    expect(JSON.stringify(h.create.mock.calls)).not.toContain(
      'SYNTHETIC_SECRET',
    );
    expect(JSON.stringify(h.create.mock.calls)).not.toContain(
      'SYNTHETIC_TOKEN',
    );
  });
  it('awaits persistence before returning but preserves a committed outcome on audit outage', async () => {
    const h = harness();
    h.create.mockRejectedValue(new Error('synthetic outage'));
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const response = { id, saved: true };
    expect(
      await firstValueFrom(
        h.interceptor.intercept(h.context, { handle: () => of(response) }),
      ),
    ).toBe(response);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it('does not record success if the operation failed', async () => {
    const h = harness();
    await expect(
      firstValueFrom(
        h.interceptor.intercept(h.context, {
          handle: () => throwError(() => new Error('failed')),
        }),
      ),
    ).rejects.toThrow('failed');
    expect(h.create).not.toHaveBeenCalled();
  });
  it('skips unannotated handlers and the separately recorded login event', async () => {
    for (const action of ['', 'LOGIN']) {
      const h = harness(action);
      await firstValueFrom(
        h.interceptor.intercept(h.context, { handle: () => of({ id }) }),
      );
      expect(h.create).not.toHaveBeenCalled();
    }
  });
  it('rejects invalid organization identifiers rather than trusting arbitrary response fields', async () => {
    const h = harness();
    h.request.user.organizationId = 'invalid';
    await firstValueFrom(
      h.interceptor.intercept(h.context, { handle: () => of({ id }) }),
    );
    expect(h.create).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
  });
});
