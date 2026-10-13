import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { AuditLogsService } from './audit-logs.service';

function harness() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    staff: { findFirst: jest.fn().mockResolvedValue({ id: 'admin' }) },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const tenant = {
    run: (
      _org: string,
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => fn(tx as unknown as Prisma.TransactionClient),
  };
  return {
    tx,
    service: new AuditLogsService(tenant as unknown as TenantPrismaService),
  };
}
describe('Current administrator audit access', () => {
  it('denies a missing, demoted or disabled actor before reading logs', async () => {
    const { tx, service } = harness();
    tx.staff.findFirst.mockResolvedValue(null);
    await expect(service.findAll('org', {}, 'admin')).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.staff.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'admin',
        organizationId: 'org',
        role: 'org_admin',
        isActive: true,
      },
      select: { id: true },
    });
    expect(tx.auditLog.findMany).not.toHaveBeenCalled();
    expect(tx.auditLog.count).not.toHaveBeenCalled();
  });
  it('retains the tenant predicate and only exposes the actor name', async () => {
    const { tx, service } = harness();
    await service.findAll('org', { action: 'loan.update' }, 'admin');
    expect(tx.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org', action: 'loan.update' },
        include: { actorStaff: { select: { fullName: true } } },
      }),
    );
    expect(tx.auditLog.count).toHaveBeenCalledWith({
      where: { organizationId: 'org', action: 'loan.update' },
    });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.staff.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.staff.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.auditLog.findMany.mock.invocationCallOrder[0],
    );
  });
});
