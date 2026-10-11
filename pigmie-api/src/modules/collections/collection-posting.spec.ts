import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CollectionsService } from './collections.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  CreateCollectionDto,
  CollectionMethodEnum,
} from './dto/collection.dto';

const dto: CreateCollectionDto = {
  clientGeneratedId: '2e0a1a68-136a-49a7-8763-5e6e60fa38b8',
  loanId: '6582d380-7318-4f92-8294-a36f4718ad19',
  amount: 55,
  collectionDate: '2026-01-31',
  collectedAt: '2026-01-31T10:00:00Z',
  collectionMethod: CollectionMethodEnum.cash,
};
function harness() {
  const actor = { id: 'staff', role: 'agent', branchId: null as string | null };
  const row = {
    id: 'row',
    installmentNumber: 1,
    dueAmount: new Prisma.Decimal(110),
    paidAmount: new Prisma.Decimal(0),
    principalComponent: new Prisma.Decimal(100),
    interestComponent: new Prisma.Decimal(10),
    status: 'pending',
    dueDate: new Date('2026-01-31'),
  };
  const collection = {
    id: 'collection',
    loanId: dto.loanId,
    amount: new Prisma.Decimal(55),
    collectionDate: new Date(dto.collectionDate),
    collectionMethod: 'cash',
    receiptNumber: 'receipt',
    notes: null as string | null,
    allocationDetails: null as Prisma.JsonValue,
  };
  const tx = {
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    staff: { findFirst: jest.fn().mockResolvedValue(actor) },
    loan: {
      findFirst: jest
        .fn<
          Promise<{
            id: string;
            totalPayable: Prisma.Decimal;
            totalCollected: Prisma.Decimal;
            outstandingBalance: Prisma.Decimal;
            customer: { id: string; email: string; fullName: string };
          } | null>,
          [args: Prisma.LoanFindFirstArgs]
        >()
        .mockResolvedValue({
          id: dto.loanId,
          totalPayable: new Prisma.Decimal(110),
          totalCollected: new Prisma.Decimal(0),
          outstandingBalance: new Prisma.Decimal(110),
          customer: {
            id: 'customer',
            email: 'synthetic@example.invalid',
            fullName: 'Synthetic',
          },
        }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    collection: {
      findFirst: jest
        .fn<
          Promise<typeof collection | null>,
          [args: Prisma.CollectionFindFirstArgs]
        >()
        .mockResolvedValue(null),
      create: jest
        .fn<Promise<typeof collection>, [args: Prisma.CollectionCreateArgs]>()
        .mockResolvedValue(collection),
      update: jest.fn().mockResolvedValue(collection),
    },
    loanSchedule: {
      findMany: jest.fn().mockResolvedValue([row]),
      update: jest.fn<
        Promise<unknown>,
        [args: Prisma.LoanScheduleUpdateArgs]
      >(),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  let committed = false;
  const run = jest.fn(
    async (
      _org: string,
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
      const value = await callback(tx as unknown as Prisma.TransactionClient);
      committed = true;
      return value;
    },
  );
  const send = jest.fn(() => {
    expect(committed).toBe(true);
    return Promise.resolve();
  });
  const service = new CollectionsService(
    { run } as unknown as TenantPrismaService,
    {} as PrismaService,
    { sendPaymentConfirmation: send } as unknown as EmailService,
  );
  return { service, tx, actor, collection, row, send };
}
describe('Payment posting and retry safety', () => {
  it('requires the financial audit before commit and confirmation', async () => {
    const h = harness();
    h.tx.auditLog.create.mockRejectedValue(
      new Error('Synthetic audit failure'),
    );
    await expect(
      h.service.recordCollection('org', 'staff', dto),
    ).rejects.toThrow('Synthetic audit failure');
    expect(h.send).not.toHaveBeenCalled();
  });
  it('rejects new public evidence URLs before payment creation', async () => {
    const h = harness();
    await expect(
      h.service.recordCollection('org', 'staff', {
        ...dto,
        photoUrl: 'https://example.test/photo',
      }),
    ).rejects.toThrow('private documents');
    expect(h.tx.collection.create).not.toHaveBeenCalled();
  });
  it('locks and rechecks the current actor/loan assignment before posting', async () => {
    const h = harness();
    expect((await h.service.recordCollection('org', 'staff', dto)).status).toBe(
      'created',
    );
    expect(h.tx.loan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: dto.loanId,
          organizationId: 'org',
          status: { in: ['active', 'defaulted'] },
          assignedAgentId: 'staff',
        },
      }),
    );
    expect(h.tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(
      h.tx.collection.create.mock.invocationCallOrder[0],
    );
    expect(h.tx.loanSchedule.update).toHaveBeenCalledWith({
      where: { id: 'row' },
      data: { paidAmount: new Prisma.Decimal(55), status: 'partially_paid' },
    });
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it('acknowledges an original owned retry without posting or emailing again', async () => {
    const h = harness();
    h.tx.collection.findFirst.mockResolvedValue(h.collection);
    expect((await h.service.recordCollection('org', 'staff', dto)).status).toBe(
      'duplicate',
    );
    expect(h.tx.collection.findFirst).toHaveBeenCalledWith({
      where: {
        clientGeneratedId: dto.clientGeneratedId,
        organizationId: 'org',
        collectedById: 'staff',
      },
    });
    expect(h.tx.collection.create).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
  it('rejects reuse of an identifier with different financial details', async () => {
    const h = harness();
    h.tx.collection.findFirst.mockResolvedValue(h.collection);
    await expect(
      h.service.recordCollection('org', 'staff', { ...dto, amount: 56 }),
    ).rejects.toThrow('different details');
    expect(h.tx.collection.create).not.toHaveBeenCalled();
  });
  it('fails closed on a foreign identifier collision without querying an aborted transaction', async () => {
    const h = harness();
    h.tx.collection.create.mockRejectedValue(
      Object.assign(new Error('unique constraint'), { code: 'P2002' }),
    );
    await expect(
      h.service.recordCollection('org', 'staff', dto),
    ).rejects.toThrow('unique constraint');
    expect(h.tx.collection.findFirst).toHaveBeenCalledTimes(1);
    expect(h.tx.loanSchedule.update).not.toHaveBeenCalled();
  });
  it('blocks a disabled actor, accountant, or unassigned manager even after the guard passed', async () => {
    for (const role of ['accountant', 'branch_manager']) {
      const h = harness();
      h.actor.role = role;
      await expect(
        h.service.recordCollection('org', 'staff', dto),
      ).rejects.toThrow('not permitted');
      expect(h.tx.collection.create).not.toHaveBeenCalled();
    }
    const h = harness();
    h.tx.staff.findFirst.mockResolvedValue(null);
    await expect(
      h.service.recordCollection('org', 'staff', dto),
    ).rejects.toThrow('not permitted');
  });
  it('rejects a reassigned or closed loan at the mutation itself', async () => {
    const h = harness();
    h.tx.loan.findFirst.mockResolvedValue(null);
    await expect(
      h.service.recordCollection('org', 'staff', dto),
    ).rejects.toThrow('not active');
    expect(h.tx.collection.create).not.toHaveBeenCalled();
  });
  it('rejects excessive payments and does not send a confirmation before commit', async () => {
    const h = harness();
    await expect(
      h.service.recordCollection('org', 'staff', { ...dto, amount: 111 }),
    ).rejects.toThrow('exceeds');
    expect(h.send).not.toHaveBeenCalled();
  });
  it('persists exact installment allocation in the payment transaction', async () => {
    const h = harness();
    await h.service.recordCollection('org', 'staff', dto);
    expect(h.tx.collection.update).toHaveBeenCalledWith({
      where: { id: 'collection', organizationId: 'org' },
      data: {
        allocationDetails: {
          version: 1,
          rows: [{ scheduleId: 'row', amount: '55.00' }],
        },
      },
    });
  });
  it('rejects a schedule that disagrees with outstanding balance', async () => {
    const h = harness();
    h.row.dueAmount = new Prisma.Decimal(120);
    await expect(
      h.service.recordCollection('org', 'staff', dto),
    ).rejects.toThrow('Schedule requires reconciliation');
    expect(h.tx.loanSchedule.update).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
  it('refuses to guess the installment allocation of a historical payment', async () => {
    const h = harness();
    h.actor.role = 'org_admin';
    h.tx.collection.findFirst.mockResolvedValue(h.collection);
    h.tx.loanSchedule.count.mockResolvedValue(0);
    await expect(
      h.service.reverseCollection('org', 'collection', 'staff', 'test'),
    ).rejects.toThrow('Historical payment allocation');
    expect(h.tx.loanSchedule.update).not.toHaveBeenCalled();
  });
  it('reverses the recorded installment rather than the newest paid installment', async () => {
    const h = harness();
    h.actor.role = 'org_admin';
    h.row.paidAmount = new Prisma.Decimal(55);
    h.collection.allocationDetails = {
      version: 1,
      rows: [{ scheduleId: 'row', amount: '55.00' }],
    };
    h.tx.collection.findFirst.mockResolvedValue(h.collection);
    h.tx.loanSchedule.count.mockResolvedValue(0);
    await h.service.reverseCollection('org', 'collection', 'staff', 'test');
    expect(h.tx.loanSchedule.findMany).toHaveBeenCalledWith({
      where: {
        loanId: dto.loanId,
        id: { in: ['row'] },
        status: { in: ['paid', 'partially_paid', 'overdue'] },
      },
    });
    expect(h.tx.loanSchedule.update.mock.calls[0][0].where).toEqual({
      id: 'row',
    });
    expect(h.tx.loanSchedule.update.mock.calls[0][0].data.paidAmount).toEqual(
      new Prisma.Decimal(0),
    );
    expect(h.tx.loan.updateMany).toHaveBeenCalledWith({
      where: { id: dto.loanId, status: 'closed' },
      data: { status: 'active', closedAt: null },
    });
  });
  it('rejects mismatched saved allocation before schedule mutation', async () => {
    const h = harness();
    h.actor.role = 'org_admin';
    h.collection.allocationDetails = {
      version: 1,
      rows: [{ scheduleId: 'row', amount: '54.00' }],
    };
    h.tx.collection.findFirst.mockResolvedValue(h.collection);
    h.tx.loanSchedule.count.mockResolvedValue(0);
    await expect(
      h.service.reverseCollection('org', 'collection', 'staff', 'test'),
    ).rejects.toThrow('allocation requires reconciliation');
    expect(h.tx.loanSchedule.update).not.toHaveBeenCalled();
  });
  it('keeps a committed payment when the confirmation service fails', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const h = harness();
    h.send.mockRejectedValue(new Error('synthetic mail outage'));
    expect((await h.service.recordCollection('org', 'staff', dto)).status).toBe(
      'created',
    );
    warning.mockRestore();
  });
  it.each([NaN, Infinity, 0, -1, 55.001])(
    'rejects invalid amount %s before any transaction',
    async (amount) => {
      const h = harness();
      await expect(
        h.service.recordCollection('org', 'staff', { ...dto, amount }),
      ).rejects.toThrow();
      expect(h.tx.$executeRaw).not.toHaveBeenCalled();
    },
  );
  it('refuses regular reversal of a settled early-closure payment', async () => {
    const h = harness();
    h.actor.role = 'org_admin';
    h.collection.notes = 'Pre-closure payment';
    h.tx.collection.findFirst.mockResolvedValue(h.collection);
    await expect(
      h.service.reverseCollection('org', 'collection', 'staff', 'synthetic'),
    ).rejects.toThrow('settlement adjustment');
    expect(h.tx.collection.update).not.toHaveBeenCalled();
  });
  it('refuses reversal on a loan with waived balances needing reconciliation', async () => {
    const h = harness();
    h.actor.role = 'org_admin';
    h.tx.collection.findFirst.mockResolvedValue(h.collection);
    await expect(
      h.service.reverseCollection('org', 'collection', 'staff', 'synthetic'),
    ).rejects.toThrow('settlement reconciliation');
    expect(h.tx.collection.update).not.toHaveBeenCalled();
  });
});
