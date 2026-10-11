import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CashDepositsService } from './cash-deposits.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffUser } from '../../common/types/request-user.type';

const agent: StaffUser = {
  type: 'staff',
  id: 'agent',
  organizationId: 'org',
  role: 'agent',
  branchId: 'branch-a',
};
function harness() {
  const actor = { id: agent.id, role: agent.role, branchId: agent.branchId };
  const tx = {
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    staff: {
      findFirst: jest.fn().mockResolvedValue(actor),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: agent.id, fullName: 'Synthetic' }]),
    },
    cashDeposit: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'deposit', agentId: agent.id, notes: null }),
      update: jest.fn().mockResolvedValue({ id: 'deposit' }),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { amount: new Prisma.Decimal(10) } }),
    },
    collection: {
      aggregate: jest
        .fn<
          Promise<{ _sum: { amount: Prisma.Decimal } }>,
          [{ where: Prisma.CollectionWhereInput; _sum: { amount: boolean } }]
        >()
        .mockResolvedValue({ _sum: { amount: new Prisma.Decimal(10) } }),
    },
  };
  const tenant = {
    run: (
      _org: string,
      action: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => action(tx as unknown as Prisma.TransactionClient),
  };
  return {
    service: new CashDepositsService(
      tenant as unknown as TenantPrismaService,
      {} as PrismaService,
    ),
    tx,
  };
}
describe('Cash deposit scope and verification', () => {
  it('fails verification when required transactional audit persistence fails', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'admin',
      role: 'org_admin',
      branchId: 'branch-a',
    });
    tx.auditLog.create.mockRejectedValue(new Error('Synthetic audit failure'));
    await expect(
      service.verify('org', 'deposit', 'admin', { status: 'verified' }),
    ).rejects.toThrow('Synthetic audit failure');
  });
  it('overrides a forged agent list filter with the authenticated owner', async () => {
    const { service, tx } = harness();
    await service.findAll('org', { agentId: 'foreign' }, agent);
    expect(tx.cashDeposit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org', agentId: agent.id },
      }),
    );
  });
  it('constrains manager lists to the current branch', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'manager',
      role: 'branch_manager',
      branchId: 'branch-a',
    });
    await service.findAll('org', {}, { ...agent, role: 'branch_manager' });
    expect(tx.cashDeposit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          agent: { organizationId: 'org', branchId: 'branch-a' },
        },
      }),
    );
  });
  it('denies a manager without a branch before reading deposits', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'manager',
      role: 'branch_manager',
      branchId: null,
    });
    await expect(
      service.findAll('org', {}, { ...agent, role: 'branch_manager' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.cashDeposit.findMany).not.toHaveBeenCalled();
  });
  it('denies a manager verification for a deposit from another branch', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst
      .mockResolvedValueOnce({
        id: 'manager',
        role: 'branch_manager',
        branchId: 'branch-a',
      })
      .mockResolvedValueOnce({
        id: agent.id,
        role: 'agent',
        branchId: 'branch-b',
      });
    await expect(
      service.verify('org', 'deposit', 'manager', { status: 'verified' }),
    ).rejects.toThrow(NotFoundException);
    expect(tx.cashDeposit.update).not.toHaveBeenCalled();
  });
  it('locks verification and only updates a pending tenant record', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'manager',
      role: 'branch_manager',
      branchId: 'branch-a',
    });
    await service.verify('org', 'deposit', 'manager', { status: 'verified' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.cashDeposit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deposit', organizationId: 'org', status: 'pending' },
      }),
    );
  });
  it('rejects a second verification without another update', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'admin',
      role: 'org_admin',
      branchId: null,
    });
    tx.cashDeposit.findFirst.mockResolvedValue(null);
    await expect(
      service.verify('org', 'deposit', 'admin', { status: 'verified' }),
    ).rejects.toThrow(NotFoundException);
    expect(tx.cashDeposit.update).not.toHaveBeenCalled();
  });
  it('limits reconciliation to branch agents and cash payments', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'manager',
      role: 'branch_manager',
      branchId: 'branch-a',
    });
    const result = await service.getReconciliation(
      'org',
      '2026-01-01',
      '2026-01-31',
      { ...agent, role: 'branch_manager' },
    );
    expect(tx.staff.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        role: 'agent',
        isActive: true,
        branchId: 'branch-a',
      },
      select: { id: true, fullName: true },
    });
    expect(
      tx.collection.aggregate.mock.calls[0][0].where.collectionMethod,
    ).toBe('cash');
    expect(result[0].status).toBe('balanced');
  });
});
