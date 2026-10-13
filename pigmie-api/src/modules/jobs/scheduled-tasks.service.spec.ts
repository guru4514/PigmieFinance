import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const d = (n: number) => new Prisma.Decimal(n);
function harness() {
  let row = {
    id: 'row',
    dueDate: new Date('2026-01-30'),
    status: 'pending',
    principalComponent: d(100),
    interestComponent: d(10),
    dueAmount: d(110),
    paidAmount: d(0),
  };
  let loan = {
    id: 'loan',
    organizationId: 'org',
    status: 'active',
    totalPayable: d(110),
    outstandingBalance: d(110),
    loanProduct: { lateFeeType: 'flat', lateFeeValue: d(10) },
  };
  let markers: string[] = [];
  let failAudit = false;
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    loan: {
      findMany: jest.fn().mockResolvedValue([{ id: 'loan' }]),
      findFirst: jest.fn(() =>
        Promise.resolve(loan.status === 'active' ? loan : null),
      ),
      update: jest.fn(
        ({
          data,
        }: {
          data: {
            status?: string;
            totalPayable?: { increment: Prisma.Decimal };
            outstandingBalance?: { increment: Prisma.Decimal };
          };
        }) => {
          if (data.totalPayable)
            loan.totalPayable = loan.totalPayable.plus(
              data.totalPayable.increment,
            );
          if (data.outstandingBalance)
            loan.outstandingBalance = loan.outstandingBalance.plus(
              data.outstandingBalance.increment,
            );
          if (data.status) loan.status = data.status;
          return Promise.resolve(loan);
        },
      ),
    },
    loanSchedule: {
      findMany: jest.fn(() =>
        Promise.resolve(
          ['pending', 'partially_paid'].includes(row.status) ? [row] : [],
        ),
      ),
      update: jest.fn(
        ({
          data,
        }: {
          data: { status: string; dueAmount?: { increment: Prisma.Decimal } };
        }) => {
          row.status = data.status;
          if (data.dueAmount)
            row.dueAmount = row.dueAmount.plus(data.dueAmount.increment);
          return Promise.resolve(row);
        },
      ),
      count: jest.fn(({ where }: { where: { dueDate: { lt: Date } } }) =>
        Promise.resolve(
          row.status === 'overdue' && row.dueDate < where.dueDate.lt ? 1 : 0,
        ),
      ),
    },
    auditLog: {
      findMany: jest.fn(() =>
        Promise.resolve(
          markers.includes('loan_schedule.overdue')
            ? [{ entityId: 'row' }]
            : [],
        ),
      ),
      create: jest.fn(({ data }: { data: { action: string } }) => {
        if (failAudit) {
          failAudit = false;
          return Promise.reject(new Error('Synthetic audit failure'));
        }
        markers.push(data.action);
        return Promise.resolve({ id: 'marker' });
      }),
    },
  };
  let tail = Promise.resolve();
  const run = jest.fn(
    async (
      _org: string,
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
      let result: unknown;
      const next = tail.then(async () => {
        const savedRow = { ...row },
          savedLoan = { ...loan },
          savedMarkers = [...markers];
        try {
          result = await callback(tx as unknown as Prisma.TransactionClient);
        } catch (error) {
          row = savedRow;
          loan = savedLoan;
          markers = savedMarkers;
          throw error;
        }
      });
      tail = next.catch(() => undefined);
      await next;
      return result;
    },
  );
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'org' }]),
    organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org' }]) },
    loan: { findMany: jest.fn().mockResolvedValue([{ id: 'loan' }]) },
    auditLog: { deleteMany: jest.fn() },
  };
  const service = new ScheduledTasksService(
    prisma as unknown as PrismaService,
    { run } as unknown as TenantPrismaService,
  );
  return {
    service,
    tx,
    prisma,
    run,
    row: () => row,
    loan: () => loan,
    markers: () => markers,
    failNextAudit: () => {
      failAudit = true;
    },
    addMarker: () => {
      markers.push('loan_schedule.overdue');
    },
  };
}

describe('Active overdue job', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-31T19:30:00Z'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('marks overdue and persists durable evidence without adding uncontracted debt', async () => {
    const h = harness();
    await h.service.markOverdueInstallments();
    expect(h.row().status).toBe('overdue');
    expect(h.row().dueAmount.toNumber()).toBe(110);
    expect(h.loan().totalPayable.toNumber()).toBe(110);
    expect(h.loan().outstandingBalance.toNumber()).toBe(110);
    expect(h.markers()).toEqual(['loan_schedule.overdue']);
    expect(h.run).toHaveBeenCalledWith('org', expect.any(Function), {
      timeout: 60000,
    });
    expect(h.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      h.tx.loan.findFirst.mock.invocationCallOrder[0],
    );
  });
  it('does not charge from mutable percentage settings', async () => {
    const h = harness();
    h.loan().loanProduct.lateFeeType = 'percentage';
    h.loan().loanProduct.lateFeeValue = d(1.25);
    await h.service.markOverdueInstallments();
    expect(h.row().dueAmount.toNumber()).toBe(110);
    expect(h.loan().totalPayable.toNumber()).toBe(110);
  });
  it('does not charge a fee twice on repeated or concurrent runs', async () => {
    const h = harness();
    await Promise.all([
      h.service.markOverdueInstallments(),
      h.service.markOverdueInstallments(),
    ]);
    await h.service.markOverdueInstallments();
    expect(h.row().dueAmount.toNumber()).toBe(110);
    expect(h.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it('does not charge again when payment or reversal changed the status', async () => {
    const h = harness();
    await h.service.markOverdueInstallments();
    h.row().status = 'partially_paid';
    h.row().paidAmount = d(20);
    await h.service.markOverdueInstallments();
    expect(h.row().dueAmount.toNumber()).toBe(110);
    expect(h.loan().totalPayable.toNumber()).toBe(110);
  });
  it('preserves the zero-fee marker if product configuration changes later', async () => {
    const h = harness();
    h.loan().loanProduct.lateFeeValue = d(0);
    await h.service.markOverdueInstallments();
    h.row().status = 'pending';
    h.loan().loanProduct.lateFeeValue = d(10);
    await h.service.markOverdueInstallments();
    expect(h.row().dueAmount.toNumber()).toBe(110);
    expect(h.tx.loan.update).not.toHaveBeenCalled();
  });
  it('preserves legacy fees without silently repairing historical loan totals', async () => {
    const h = harness();
    h.row().dueAmount = d(120);
    h.row().status = 'partially_paid';
    await h.service.markOverdueInstallments();
    expect(h.row().dueAmount.toNumber()).toBe(120);
    expect(h.loan().totalPayable.toNumber()).toBe(110);
    expect(h.markers()).toEqual(['loan_schedule.overdue']);
  });
  it('retains a previous marker even if an operator changed the due amount', async () => {
    const h = harness();
    h.addMarker();
    await h.service.markOverdueInstallments();
    expect(h.row().dueAmount.toNumber()).toBe(110);
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('rolls back all financial changes when audit persistence fails, then safely retries', async () => {
    const h = harness();
    h.failNextAudit();
    await h.service.markOverdueInstallments();
    expect(h.row().status).toBe('pending');
    expect(h.row().dueAmount.toNumber()).toBe(110);
    expect(h.loan().totalPayable.toNumber()).toBe(110);
    expect(h.markers()).toEqual([]);
    await h.service.markOverdueInstallments();
    expect(h.loan().totalPayable.toNumber()).toBe(110);
  });
  it('does not penalize fully paid rows with stale status', async () => {
    const h = harness();
    h.row().paidAmount = d(110);
    await h.service.markOverdueInstallments();
    expect(h.row().status).toBe('paid');
    expect(h.row().dueAmount.toNumber()).toBe(110);
    expect(h.tx.loan.update).not.toHaveBeenCalled();
  });
  it('uses the Indian business date and explicit tenant/active filters', async () => {
    const h = harness();
    await h.service.markOverdueInstallments();
    expect(h.prisma.$queryRaw).toHaveBeenCalled();
    expect(h.prisma.organization.findMany).not.toHaveBeenCalled();
    expect(h.prisma.loan.findMany).not.toHaveBeenCalled();
    expect(h.run).toHaveBeenCalledWith('org', expect.any(Function));
    expect(h.tx.loan.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        status: 'active',
        schedule: {
          some: {
            dueDate: { lt: new Date('2026-02-01') },
            status: { in: ['pending', 'partially_paid', 'overdue'] },
          },
        },
      },
      select: { id: true },
    });
    expect(h.tx.loanSchedule.findMany).toHaveBeenCalledWith({
      where: {
        loanId: 'loan',
        dueDate: { lt: new Date('2026-02-01') },
        status: { in: ['pending', 'partially_paid'] },
      },
      orderBy: { installmentNumber: 'asc' },
    });
  });
  it('defaults loans only beyond 90 days and records the transition', async () => {
    const h = harness();
    h.row().dueDate = new Date('2025-11-02');
    await h.service.markOverdueInstallments();
    expect(h.loan().status).toBe('defaulted');
    expect(h.markers()).toContain('loan.defaulted');
  });
  it('does not delete financial evidence under the former audit purge', () => {
    const h = harness();
    h.service.archiveOldAuditLogs();
    expect(h.prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});
