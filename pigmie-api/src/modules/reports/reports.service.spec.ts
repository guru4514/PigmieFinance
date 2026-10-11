import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReportsService } from './reports.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { StaffUser } from '../../common/types/request-user.type';

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
      count: jest.fn().mockResolvedValue(0),
      findMany: jest
        .fn<Promise<unknown[]>, [{ where: Prisma.LoanWhereInput }]>()
        .mockResolvedValue([]),
    },
    collection: {
      findMany: jest
        .fn<Promise<unknown[]>, [{ where: Prisma.CollectionWhereInput }]>()
        .mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
    loanSchedule: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
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
    run: (
      _org: string,
      action: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => action(tx as unknown as Prisma.TransactionClient),
  };
  return {
    service: new ReportsService(tenant as unknown as TenantPrismaService),
    tx,
  };
}
describe('Report identity and scope', () => {
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
        status: 'active',
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
        status: 'overdue',
        loan: {
          organizationId: 'org',
          status: 'active',
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
