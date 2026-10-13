import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReportsService } from './reports.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { StaffUser } from '../../common/types/request-user.type';
import { businessDate } from '../loans/utils/date.util';

const agent: StaffUser = {
  type: 'staff',
  id: 'staff-record',
  organizationId: 'org',
  role: 'agent',
  branchId: null,
};
function harness() {
  const tx = {
    customer: {
      findMany: jest
        .fn<
          Promise<{ id: string; fullName: string }[]>,
          [Prisma.CustomerFindManyArgs]
        >()
        .mockResolvedValue([]),
    },
    staff: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: agent.id, role: agent.role, branchId: null }),
    },
    loan: {
      count: jest
        .fn<Promise<number>, [Prisma.LoanCountArgs]>()
        .mockResolvedValue(0),
      findMany: jest
        .fn<Promise<unknown[]>, [{ where: Prisma.LoanWhereInput }]>()
        .mockResolvedValue([]),
    },
    collection: {
      findMany: jest
        .fn<Promise<unknown[]>, [{ where: Prisma.CollectionWhereInput }]>()
        .mockResolvedValue([]),
      aggregate: jest
        .fn<
          Promise<{ _sum: { amount: Prisma.Decimal | null } }>,
          [Prisma.CollectionAggregateArgs]
        >()
        .mockResolvedValue({ _sum: { amount: null } }),
    },
    loanSchedule: {
      fields: {
        paidAmount: {
          field: 'paidAmount',
        } as unknown as Prisma.LoanScheduleFieldRefs['paidAmount'],
      },
      findMany: jest
        .fn<
          Promise<{ dueAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }[]>,
          [Prisma.LoanScheduleFindManyArgs]
        >()
        .mockResolvedValue([]),
      count: jest
        .fn<Promise<number>, [Prisma.LoanScheduleCountArgs]>()
        .mockResolvedValue(0),
    },
    $queryRaw: jest
      .fn<
        Promise<Record<string, unknown>[]>,
        [TemplateStringsArray, ...unknown[]]
      >()
      .mockResolvedValue([]),
  };
  const tenant = {
    runAtomic: (
      _org: string,
      action: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => action(tx as unknown as Prisma.TransactionClient),
    run: jest.fn(
      (
        _org: string,
        action: (client: Prisma.TransactionClient) => Promise<unknown>,
        _options?: { isolationLevel: Prisma.TransactionIsolationLevel },
      ) => {
        void _options;
        return action(tx as unknown as Prisma.TransactionClient);
      },
    ),
  };
  return {
    service: new ReportsService(tenant as unknown as TenantPrismaService),
    tx,
    tenant,
  };
}
describe('Report identity and scope', () => {
  it('rejects negative portfolio balances even when the risk fraction looks valid', async () => {
    const { service, tx } = harness();
    tx.loan.findMany.mockResolvedValue([
      { outstandingBalance: new Prisma.Decimal(200) },
      { outstandingBalance: new Prisma.Decimal(-100) },
    ]);
    tx.$queryRaw.mockResolvedValue([{ par_30: new Prisma.Decimal(0) }]);
    await expect(service.getPortfolioAtRisk('org', agent)).rejects.toThrow(
      'reconciliation',
    );
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('starts monthly receipts at the Indian calendar month boundary', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-31T19:00:00Z'));
    try {
      const { service, tx } = harness();
      await service.getDashboardSummary('org', agent);
      expect(tx.collection.aggregate.mock.calls[0][0]).toMatchObject({
        where: {
          collectionDate: {
            gte: new Date('2026-11-01'),
            lte: new Date('2026-11-01'),
          },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });
  it.each(['NaN', '-0.1', '1.01'])(
    'rejects invalid portfolio risk fraction %s',
    async (fraction) => {
      const { service, tx } = harness();
      tx.$queryRaw.mockResolvedValue([
        { par_30: new Prisma.Decimal(fraction) },
      ]);
      await expect(service.getPortfolioAtRisk('org', agent)).rejects.toThrow(
        'reconciliation',
      );
      await expect(service.getDashboardSummary('org', agent)).rejects.toThrow(
        'reconciliation',
      );
    },
  );
  it('measures fulfillment against full scheduled dues, independent of unrelated receipts', async () => {
    const { service, tx } = harness();
    tx.loanSchedule.findMany.mockResolvedValue([
      {
        dueAmount: new Prisma.Decimal(100),
        paidAmount: new Prisma.Decimal(50),
      },
    ]);
    tx.collection.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(1000) },
    ]);
    expect(await service.getDashboardSummary('org', agent)).toMatchObject({
      dueToday: 50,
      collectionEfficiency: 50,
      collectedToday: 1000,
      scheduledDueToday: 100,
      paidTowardDueToday: 50,
    });
  });
  it('includes paid rows and closed loans in today scheduled fulfillment', async () => {
    const { service, tx } = harness();
    tx.loanSchedule.findMany.mockResolvedValue([
      {
        dueAmount: new Prisma.Decimal(100),
        paidAmount: new Prisma.Decimal(100),
      },
    ]);
    expect(await service.getDashboardSummary('org', agent)).toMatchObject({
      dueToday: 0,
      collectionEfficiency: 100,
    });
    expect(tx.loanSchedule.findMany.mock.calls[0][0].where).toMatchObject({
      status: { not: 'waived' },
      loan: {
        status: { in: ['active', 'defaulted', 'closed'] },
        assignedAgentId: agent.id,
      },
    });
  });
  it('does not invent fulfillment when no installments are due', async () => {
    const { service, tx } = harness();
    tx.collection.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(1000) },
    ]);
    expect(await service.getDashboardSummary('org', agent)).toMatchObject({
      collectionEfficiency: 0,
      dueToday: 0,
    });
  });
  it('sums paise exactly and includes defaulted outstanding debt', async () => {
    const { service, tx } = harness();
    tx.loan.findMany.mockResolvedValue([
      { outstandingBalance: new Prisma.Decimal('0.1') },
      { outstandingBalance: new Prisma.Decimal('0.2') },
    ]);
    expect(await service.getDashboardSummary('org', agent)).toMatchObject({
      totalOutstanding: 0.3,
    });
    expect(tx.loan.findMany.mock.calls[0][0].where.status).toEqual({
      in: ['active', 'defaulted'],
    });
  });
  it.each(['NaN', '-1', '101'])(
    'rejects invalid paid amount %s instead of hiding it in a percentage',
    async (paid) => {
      const { service, tx } = harness();
      tx.loanSchedule.findMany.mockResolvedValue([
        {
          dueAmount: new Prisma.Decimal(100),
          paidAmount: new Prisma.Decimal(paid),
        },
      ]);
      await expect(service.getDashboardSummary('org', agent)).rejects.toThrow(
        'reconciliation',
      );
    },
  );
  it('uses the Indian business date and counts overdue loans independently of job status', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-13T19:00:00Z'));
    try {
      const { service, tx, tenant } = harness();
      await service.getDashboardSummary('org', agent);
      expect(tx.loanSchedule.findMany.mock.calls[0][0].where?.dueDate).toEqual(
        new Date('2026-10-14'),
      );
      expect(tx.loan.count.mock.calls[1][0].where).toMatchObject({
        schedule: {
          some: {
            dueDate: { lt: new Date('2026-10-14') },
            dueAmount: { gt: tx.loanSchedule.fields.paidAmount },
            status: { in: ['pending', 'partially_paid', 'overdue'] },
          },
        },
      });
      expect(tenant.run).toHaveBeenCalledWith('org', expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      });
      const [strings, ...values] = tx.$queryRaw.mock.calls[0];
      const sql = Prisma.sql(strings, ...values);
      expect(sql.text).not.toContain('current_date');
      expect(sql.values).toContainEqual(new Date('2026-10-14'));
    } finally {
      jest.useRealTimers();
    }
  });
  it('uses the staff record ID and limits dashboard queries and risk SQL to the agent', async () => {
    const { service, tx } = harness();
    await service.getDashboardSummary('org', agent);
    expect(tx.staff.findUnique).toHaveBeenCalledWith({
      where: { id: agent.id, organizationId: 'org', isActive: true },
      select: { id: true, role: true, branchId: true },
    });
    expect(tx.loan.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        status: { in: ['active', 'defaulted'] },
        assignedAgentId: agent.id,
      },
    });
    expect(tx.collection.findMany.mock.calls[0][0].where.collectedById).toBe(
      agent.id,
    );
    const [strings, ...values] = tx.$queryRaw.mock.calls[0];
    const sql = Prisma.sql(strings, ...values);
    expect(sql.text).toContain('l.assigned_agent_id');
    expect(sql.values).toContain(agent.id);
  });
  it('uses the current database branch and ignores a forged branch filter', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue({
      id: agent.id,
      role: 'branch_manager',
      branchId: 'branch-a',
    });
    await service.getOverdue(
      'org',
      { branchId: 'branch-b' },
      { ...agent, role: 'branch_manager', branchId: 'stale' },
    );
    expect(tx.loanSchedule.count).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending', 'partially_paid', 'overdue'] },
        dueDate: { lt: businessDate() },
        dueAmount: { gt: tx.loanSchedule.fields.paidAmount },
        loan: {
          organizationId: 'org',
          status: { in: ['active', 'defaulted'] },
          customer: { branchId: 'branch-a' },
        },
      },
    });
  });
  it.each(['dashboard', 'overdue', 'risk', 'efficiency', 'performance'])(
    'denies a branchless manager before %s reads',
    async (report) => {
      const { service, tx } = harness();
      tx.staff.findUnique.mockResolvedValue({
        id: agent.id,
        role: 'branch_manager',
        branchId: null,
      });
      const user: StaffUser = { ...agent, role: 'branch_manager' };
      const calls = {
        dashboard: () => service.getDashboardSummary('org', user),
        overdue: () => service.getOverdue('org', {}, user),
        risk: () => service.getPortfolioAtRisk('org', user),
        efficiency: () => service.getCollectionEfficiency('org', {}, user),
        performance: () => service.getAgentPerformance('org', user),
      };
      await expect(calls[report as keyof typeof calls]()).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.loan.findMany).not.toHaveBeenCalled();
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    },
  );
  it('denies missing staff instead of returning organization totals', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue(null);
    await expect(service.getDashboardSummary('org', agent)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('denies a non-administrator export before reading business data', async () => {
    const { service, tx } = harness();
    await expect(service.exportData('org', 'customers', agent)).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.customer.findMany).not.toHaveBeenCalled();
  });
  it('exports only required customer fields and escapes formulas and quotes', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue({
      id: agent.id,
      role: 'org_admin',
      branchId: null,
    });
    tx.customer.findMany.mockResolvedValue([{ id: 'id', fullName: '=1+"2"' }]);
    expect(
      await service.exportData('org', 'customers', {
        ...agent,
        role: 'org_admin',
      }),
    ).toBe('id,fullName\n"id","\'=1+""2"""');
    expect(tx.customer.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org' },
      select: { id: true, fullName: true },
    });
  });
  it('exports portfolio percentages from the same risk calculation', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue({
      id: agent.id,
      role: 'org_admin',
      branchId: null,
    });
    tx.$queryRaw.mockResolvedValue([
      {
        par_1: new Prisma.Decimal(0.25),
        par_30: new Prisma.Decimal(0.1),
        par_90: null,
      },
    ]);
    expect(
      await service.exportData('org', 'par', { ...agent, role: 'org_admin' }),
    ).toBe('overdueDays,portfolioAtRiskPercent\n"1","25"\n"30","10"\n"90","0"');
  });
  it('provides collection and schedule CSV headers when no rows match', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue({
      id: agent.id,
      role: 'org_admin',
      branchId: null,
    });
    const admin: StaffUser = { ...agent, role: 'org_admin' };
    expect(await service.exportData('org', 'collections', admin)).toBe(
      'id,loanId,amount,collectionDate,status,receiptNumber\n',
    );
    expect(await service.exportData('org', 'schedule', admin)).toBe(
      'id,loanId,installmentNumber,dueDate,dueAmount,paidAmount,status\n',
    );
    expect(tx.loanSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { loan: { organizationId: 'org' } } }),
    );
  });
  it('rejects an unsupported export type instead of returning a fake empty CSV', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue({
      id: agent.id,
      role: 'org_admin',
      branchId: null,
    });
    await expect(
      service.exportData('org', 'unsupported', { ...agent, role: 'org_admin' }),
    ).rejects.toThrow(BadRequestException);
  });
});
