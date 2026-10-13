import { Prisma } from '@prisma/client';
import { LoansService } from './loans.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

function harness() {
  const row = {
    id: 'old-row',
    loanId: 'loan',
    installmentNumber: 1,
    dueDate: new Date('2026-02-01'),
    principalComponent: new Prisma.Decimal(100),
    interestComponent: new Prisma.Decimal(1),
    dueAmount: new Prisma.Decimal(101),
    paidAmount: new Prisma.Decimal(0),
    paidPrincipal: null as Prisma.Decimal | null,
    paidInterest: null as Prisma.Decimal | null,
    paidFees: null as Prisma.Decimal | null,
    status: 'pending',
  };
  const loan = {
    id: 'loan',
    organizationId: 'org',
    status: 'active',
    tenure: 1,
    financialTerms: null,
    startDate: new Date('2026-01-01'),
    notes: null,
    interestType: 'flat',
    interestRateAnnual: new Prisma.Decimal(12),
    collectionFrequency: 'monthly',
    totalPayable: new Prisma.Decimal(101),
    totalCollected: new Prisma.Decimal(0),
    outstandingBalance: new Prisma.Decimal(101),
    schedule: [row],
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    staff: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'admin', role: 'org_admin', branchId: null }),
    },
    loan: {
      findFirstOrThrow: jest.fn().mockResolvedValue(loan),
      update: jest.fn().mockResolvedValue(loan),
    },
    loanSchedule: {
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([
          {
            ...row,
            id: 'new-row',
            paidPrincipal: new Prisma.Decimal(0),
            paidInterest: new Prisma.Decimal(0),
            paidFees: new Prisma.Decimal(0),
          },
        ]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    loanAmendment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn<
          Promise<{ id: string; version: number }>,
          [Prisma.LoanAmendmentCreateArgs]
        >()
        .mockResolvedValue({ id: 'amendment', version: 1 }),
    },
    auditLog: {
      create: jest
        .fn<Promise<{ id: string }>, [Prisma.AuditLogCreateArgs]>()
        .mockResolvedValue({ id: 'audit' }),
    },
  };
  const service = new LoansService(
    {
      run: (
        _org: string,
        callback: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    } as unknown as TenantPrismaService,
    {} as NotificationsService,
    {} as EmailService,
  );
  return { service, tx, loan, row };
}

describe('Restructure evidence and reconciliation', () => {
  const request = {
    fromInstallmentNumber: 1,
    newTenure: 2,
    reason: 'Synthetic amendment',
  };
  it('preserves original schedule identities, exact money and unknown historical terms in the audit transaction', async () => {
    const h = harness();
    await h.service.restructure('org', 'loan', 'admin', request);
    const evidence = h.tx.auditLog.create.mock.calls[0][0].data;
    expect(evidence.oldValue).toMatchObject({
      evidenceVersion: 1,
      financialTerms: null,
      tenure: 1,
      totalPayable: '101.00',
      replacedSchedule: [
        {
          id: 'old-row',
          paidAmount: '0.00',
          dueAmount: '101.00',
          paidPrincipal: null,
          paidInterest: null,
          paidFees: null,
        },
      ],
    });
    expect(evidence.newValue).toMatchObject({
      evidenceVersion: 1,
      remainingPrincipal: '100.00',
      newTotalPayable: '102.00',
      newOutstandingBalance: '102.00',
      replacementSchedule: [
        {
          id: 'new-row',
          paidPrincipal: '0.00',
          paidInterest: '0.00',
          paidFees: '0.00',
        },
      ],
      amendmentId: 'amendment',
      amendmentVersion: 1,
      borrowerAcceptance: 'not_recorded',
    });
    expect(h.tx.loanAmendment.create.mock.calls[0][0]).toMatchObject({
      data: {
        organizationId: 'org',
        loanId: 'loan',
        actorStaffId: 'admin',
        version: 1,
        beforeEvidence: evidence.oldValue,
        afterEvidence: {
          borrowerAcceptance: 'not_recorded',
        },
      },
    });
    const lockCalls = h.tx.$executeRaw.mock.invocationCallOrder;
    expect(lockCalls[lockCalls.length - 1]).toBeLessThan(
      h.tx.loanSchedule.deleteMany.mock.invocationCallOrder[0],
    );
  });
  it('allocates the next recorded version under the existing loan lock', async () => {
    const h = harness();
    h.tx.loanAmendment.findFirst.mockResolvedValue({ version: 3 });
    await h.service.restructure('org', 'loan', 'admin', request);
    expect(h.tx.loanAmendment.create.mock.calls[0][0]).toMatchObject({
      data: { version: 4 },
    });
  });
  it('rejects a changed original loan rate before schedule replacement', async () => {
    const h = harness();
    Object.assign(h.loan, {
      principalAmount: new Prisma.Decimal(100),
      financialTerms: {
        version: 1,
        currency: 'INR',
        businessTimezone: 'Asia/Kolkata',
        paymentAllocation: 'oldest_installment_proportional_components_v1',
        earlyClosure: 'unpaid_principal_daily_accrued_interest_v1',
        rounding: 'INR_two_decimal_half_up',
        lateFee: '0.00',
        processingFee: '0.00',
        preClosurePenalty: '0.00',
        originalPrincipal: '100.00',
        originalTenure: 1,
        interestRateAnnual: '15',
        interestType: 'flat',
        collectionFrequency: 'monthly',
      },
    });
    await expect(
      h.service.restructure('org', 'loan', 'admin', request),
    ).rejects.toThrow('original financial contract');
    expect(h.tx.loanSchedule.deleteMany).not.toHaveBeenCalled();
  });
  it('requires changed tenure to be backed by the latest immutable amendment', async () => {
    const h = harness();
    Object.assign(h.loan, {
      tenure: 2,
      principalAmount: new Prisma.Decimal(100),
      financialTerms: {
        version: 1,
        currency: 'INR',
        businessTimezone: 'Asia/Kolkata',
        paymentAllocation: 'oldest_installment_proportional_components_v1',
        earlyClosure: 'unpaid_principal_daily_accrued_interest_v1',
        rounding: 'INR_two_decimal_half_up',
        lateFee: '0.00',
        processingFee: '0.00',
        preClosurePenalty: '0.00',
        originalPrincipal: '100.00',
        originalTenure: 1,
        interestRateAnnual: '12',
        interestType: 'flat',
        collectionFrequency: 'monthly',
      },
    });
    await expect(
      h.service.restructure('org', 'loan', 'admin', request),
    ).rejects.toThrow('recorded contract amendment');
    expect(h.tx.loanSchedule.deleteMany).not.toHaveBeenCalled();
    h.tx.loanAmendment.findFirst.mockResolvedValue({
      version: 1,
      afterEvidence: {
        evidenceVersion: 1,
        totalTenure: 2,
        interestRateAnnual: '12',
        interestType: 'flat',
        collectionFrequency: 'monthly',
      },
    });
    await expect(
      h.service.restructure('org', 'loan', 'admin', request),
    ).resolves.toBeDefined();
    expect(h.tx.loanAmendment.create.mock.calls[0][0]).toMatchObject({
      data: { version: 2 },
    });
  });
  it('does not acknowledge replacement if durable evidence insertion fails', async () => {
    const h = harness();
    h.tx.loanAmendment.create.mockRejectedValue(
      new Error('Synthetic evidence failure'),
    );
    await expect(
      h.service.restructure('org', 'loan', 'admin', request),
    ).rejects.toThrow('Synthetic evidence failure');
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('rejects unreconciled balances before deleting or replacing a schedule', async () => {
    const h = harness();
    h.loan.outstandingBalance = new Prisma.Decimal(100);
    await expect(
      h.service.restructure('org', 'loan', 'admin', request),
    ).rejects.toThrow('reconciliation');
    expect(h.tx.loanSchedule.deleteMany).not.toHaveBeenCalled();
    expect(h.tx.loan.update).not.toHaveBeenCalled();
  });
  it('rejects invalid schedule components even when the loan totals match', async () => {
    const h = harness();
    h.row.principalComponent = new Prisma.Decimal(-1);
    await expect(
      h.service.restructure('org', 'loan', 'admin', request),
    ).rejects.toThrow('reconciliation');
    expect(h.tx.loanSchedule.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects component payments hidden behind an unpaid row total', async () => {
    const h = harness();
    h.row.paidPrincipal = new Prisma.Decimal(1);
    await expect(
      h.service.restructure('org', 'loan', 'admin', request),
    ).rejects.toThrow('reconciliation');
    expect(h.tx.loanSchedule.deleteMany).not.toHaveBeenCalled();
  });
  it('propagates audit failure to the transaction owner instead of acknowledging success', async () => {
    const h = harness();
    h.tx.auditLog.create.mockRejectedValue(
      new Error('Synthetic audit failure'),
    );
    await expect(
      h.service.restructure('org', 'loan', 'admin', request),
    ).rejects.toThrow('Synthetic audit failure');
  });
});
