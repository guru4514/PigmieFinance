import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { LoansService } from './loans.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CloseLoanDto } from './dto/close-loan.dto';

function harness() {
  const loan = {
    id: 'loan',
    organizationId: 'org',
    customerId: 'customer',
    status: 'active',
    startDate: new Date('2026-01-01'),
    totalCollected: new Prisma.Decimal(55),
    totalPayable: new Prisma.Decimal(110),
    outstandingBalance: new Prisma.Decimal(55),
    notes: null,
    schedule: [
      {
        installmentNumber: 1,
        dueDate: new Date('2026-01-31'),
        principalComponent: new Prisma.Decimal(100),
        interestComponent: new Prisma.Decimal(10),
        dueAmount: new Prisma.Decimal(110),
        paidAmount: new Prisma.Decimal(55),
        status: 'partially_paid' as 'partially_paid' | 'paid',
      },
    ],
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    staff: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'staff', role: 'org_admin', branchId: null }),
    },
    loan: {
      findFirstOrThrow: jest
        .fn<Promise<typeof loan>, [args: Prisma.LoanFindFirstOrThrowArgs]>()
        .mockResolvedValue(loan),
      update: jest
        .fn<Promise<typeof loan>, [args: Prisma.LoanUpdateArgs]>()
        .mockResolvedValue(loan),
    },
    collection: {
      create: jest
        .fn<Promise<{ id: string }>, [args: Prisma.CollectionCreateArgs]>()
        .mockResolvedValue({ id: 'collection' }),
    },
    loanSchedule: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
  };
  const run = jest.fn(
    (
      _org: string,
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx as unknown as Prisma.TransactionClient),
  );
  const service = new LoansService(
    { run } as unknown as TenantPrismaService,
    {} as NotificationsService,
    {} as EmailService,
  );
  return { service, tx, loan };
}

describe('Loan closure settlement', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-31T10:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it('uses the same quote for reads and writes and reconciles the settled totals', async () => {
    const h = harness();
    const quote = await h.service.getPreClosureDetails('org', 'loan');
    await h.service.close('org', 'loan', 'staff', {
      preClosureAmount: quote.preClosureAmount,
    });
    expect(h.tx.loan.update.mock.calls[0][0].data).toMatchObject({
      totalPayable: new Prisma.Decimal(110),
      totalCollected: new Prisma.Decimal(110),
      outstandingBalance: 0,
      status: 'closed',
    });
    expect(h.tx.loanSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        loanId: 'loan',
        status: { in: ['pending', 'partially_paid', 'overdue'] },
      },
      data: { status: 'waived' },
    });
    expect(h.tx.auditLog.create).toHaveBeenCalled();
    expect(h.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      h.tx.collection.create.mock.invocationCallOrder[0],
    );
  });
  it.each([54, 56])(
    'rejects stale or excessive payoff %s before any payment is posted',
    async (amount) => {
      const h = harness();
      await expect(
        h.service.close('org', 'loan', 'staff', { preClosureAmount: amount }),
      ).rejects.toThrow('Refresh');
      expect(h.tx.collection.create).not.toHaveBeenCalled();
      expect(h.tx.loanSchedule.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each([NaN, Infinity, -1, 0, 55.001])(
    'rejects malformed payoff %s even without DTO validation',
    async (amount) => {
      const h = harness();
      await expect(
        h.service.close('org', 'loan', 'staff', { preClosureAmount: amount }),
      ).rejects.toThrow();
      expect(h.tx.collection.create).not.toHaveBeenCalled();
    },
  );
  it('does not close an unpaid loan without an actual payment', async () => {
    const h = harness();
    await expect(h.service.close('org', 'loan', 'staff')).rejects.toThrow(
      'outstanding',
    );
    expect(h.tx.loan.update).not.toHaveBeenCalled();
  });
  it('allows the existing fully paid closure without an invented payment', async () => {
    const h = harness();
    h.loan.outstandingBalance = new Prisma.Decimal(0);
    h.loan.totalCollected = new Prisma.Decimal(110);
    h.loan.schedule[0].paidAmount = new Prisma.Decimal(110);
    h.loan.schedule[0].status = 'paid';
    await h.service.close('org', 'loan', 'staff');
    expect(h.tx.collection.create).not.toHaveBeenCalled();
    expect(h.tx.loan.update).toHaveBeenCalled();
  });
  it('refuses a settlement when the schedule or loan aggregates conceal a balance difference', async () => {
    const h = harness();
    h.loan.outstandingBalance = new Prisma.Decimal(54);
    await expect(h.service.getPreClosureDetails('org', 'loan')).rejects.toThrow(
      'reconciliation',
    );
    await expect(
      h.service.close('org', 'loan', 'staff', { preClosureAmount: 55 }),
    ).rejects.toThrow('reconciliation');
    expect(h.tx.collection.create).not.toHaveBeenCalled();
    expect(h.tx.loan.update).not.toHaveBeenCalled();
    expect(h.tx.loanSchedule.updateMany).not.toHaveBeenCalled();
  });
  it('blocks a second closure on a closed loan', async () => {
    const h = harness();
    h.loan.status = 'closed';
    await expect(
      h.service.close('org', 'loan', 'staff', { preClosureAmount: 55 }),
    ).rejects.toThrow('not active');
    expect(h.tx.collection.create).not.toHaveBeenCalled();
  });
  it('rechecks disabled staff and changed roles inside the locked transaction', async () => {
    const h = harness();
    h.tx.staff.findFirst.mockResolvedValue(null);
    await expect(
      h.service.close('org', 'loan', 'staff', { preClosureAmount: 55 }),
    ).rejects.toThrow('not permitted');
    expect(h.tx.collection.create).not.toHaveBeenCalled();
    h.tx.staff.findFirst.mockResolvedValue({
      id: 'staff',
      role: 'agent',
      branchId: null,
    });
    await expect(
      h.service.close('org', 'loan', 'staff', { preClosureAmount: 55 }),
    ).rejects.toThrow('not permitted');
  });
  it('uses the current branch for managers and refuses managers without a branch', async () => {
    const h = harness();
    h.tx.staff.findFirst.mockResolvedValue({
      id: 'staff',
      role: 'branch_manager',
      branchId: 'branch',
    });
    await h.service.close('org', 'loan', 'staff', { preClosureAmount: 55 });
    expect(h.tx.loan.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: 'loan',
        organizationId: 'org',
        customer: { branchId: 'branch' },
      },
      include: { schedule: true },
    });
    h.tx.staff.findFirst.mockResolvedValue({
      id: 'staff',
      role: 'branch_manager',
      branchId: null,
    });
    await expect(
      h.service.close('org', 'loan', 'staff', { preClosureAmount: 55 }),
    ).rejects.toThrow('not permitted');
  });
  it('uses the Indian business date for the payment at the UTC day boundary', async () => {
    jest.setSystemTime(new Date('2026-01-31T19:00:00Z'));
    const h = harness();
    await h.service.close('org', 'loan', 'staff', { preClosureAmount: 55 });
    expect(h.tx.collection.create.mock.calls[0][0].data.collectionDate).toEqual(
      new Date('2026-02-01'),
    );
  });
  it('validates the close DTO instead of accepting untyped arbitrary amounts', async () => {
    const bad = Object.assign(new CloseLoanDto(), { preClosureAmount: 1.001 });
    expect(await validate(bad)).not.toHaveLength(0);
    expect(
      await validate(
        Object.assign(new CloseLoanDto(), { preClosureAmount: 55 }),
      ),
    ).toHaveLength(0);
  });
});
