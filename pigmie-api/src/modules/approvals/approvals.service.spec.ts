import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalRequest, Prisma, UserRole } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { CollectionsService } from '../collections/collections.service';
import { LoansService } from '../loans/loans.service';
import { StaffUser } from '../../common/types/request-user.type';

jest.mock('../customers/customers.service', () => ({
  CustomersService: class CustomersService {},
}));
jest.mock('../collections/collections.service', () => ({
  CollectionsService: class CollectionsService {},
}));
jest.mock('../loans/loans.service', () => ({
  LoansService: class LoansService {},
}));

const user: StaffUser = {
  type: 'staff',
  organizationId: 'org',
  id: 'reviewer',
  role: 'org_admin',
  branchId: null,
};
function harness() {
  let state = {
    status: 'pending' as ApprovalRequest['status'],
    actionCount: 0,
  };
  const flags = { actionFails: false, statusFails: false, targetExists: true };
  const actor = {
    id: user.id,
    role: 'org_admin' as UserRole,
    branchId: null as string | null,
  };
  const request: ApprovalRequest = {
    id: 'request',
    organizationId: 'org',
    actionType: 'reverse_collection',
    status: 'pending',
    payload: {},
    reason: null,
    entityType: 'collection',
    entityId: 'collection',
    submittedById: 'submitter',
    reviewedById: null,
    reviewNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewedAt: null,
  };
  let active = state;
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    staff: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(actor)),
    },
    collection: { findFirst: jest.fn().mockResolvedValue({ loanId: 'loan' }) },
    loan: {
      findFirst: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(flags.targetExists ? { id: 'loan' } : null),
        ),
    },
    customer: { findFirst: jest.fn().mockResolvedValue({ id: 'customer' }) },
    approvalRequest: {
      create: jest.fn().mockResolvedValue(request),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn<
          Promise<ApprovalRequest | null>,
          [Prisma.ApprovalRequestFindFirstArgs]
        >()
        .mockImplementation((args) => {
          if (
            args.where?.submittedById &&
            args.where.submittedById !== request.submittedById
          )
            return Promise.resolve(null);
          return Promise.resolve({ ...request, status: active.status });
        }),
      update: jest
        .fn<Promise<ApprovalRequest>, [Prisma.ApprovalRequestUpdateArgs]>()
        .mockImplementation(() => {
          if (flags.statusFails)
            return Promise.reject(new Error('Status write failed'));
          active.status = 'approved';
          return Promise.resolve({ ...request, status: active.status });
        }),
    },
  };
  const transaction = jest.fn(
    async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => {
      active = { ...state };
      const result = await fn(tx as unknown as Prisma.TransactionClient);
      state = { ...active };
      return result;
    },
  );
  const tenant = new TenantPrismaService({
    $transaction: transaction,
  } as unknown as PrismaService);
  const reverse = jest.fn(() =>
    tenant.run('org', (client) => {
      expect(client).toBe(tx);
      active.actionCount += 1;
      if (flags.actionFails) return Promise.reject(new Error('Action failed'));
      return Promise.resolve({});
    }),
  );
  const close = jest.fn().mockResolvedValue({});
  const service = new ApprovalsService(
    tenant,
    {} as CustomersService,
    { reverseCollection: reverse } as unknown as CollectionsService,
    { close } as unknown as LoansService,
  );
  return {
    service,
    tx,
    actor,
    request,
    flags,
    transaction,
    reverse,
    close,
    state: () => state,
  };
}

describe('Approval scope and atomic financial execution', () => {
  it('commits the action and approval in one transaction and returns the result', async () => {
    const fixture = harness();
    await expect(
      fixture.service.approve('org', 'request', user.id),
    ).resolves.toMatchObject({ status: 'approved' });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.state()).toEqual({ status: 'approved', actionCount: 1 });
    expect(fixture.tx.approvalRequest.update.mock.calls[0][0].where).toEqual({
      id: 'request',
      organizationId: 'org',
      status: 'pending',
    });
  });
  it('rolls back the financial action when approval status persistence fails', async () => {
    const fixture = harness();
    fixture.flags.statusFails = true;
    await expect(
      fixture.service.approve('org', 'request', user.id),
    ).rejects.toThrow('Status write failed');
    expect(fixture.state()).toEqual({ status: 'pending', actionCount: 0 });
  });
  it('does not approve a failed action', async () => {
    const fixture = harness();
    fixture.flags.actionFails = true;
    await expect(
      fixture.service.approve('org', 'request', user.id),
    ).rejects.toThrow('Action failed');
    expect(fixture.tx.approvalRequest.update).not.toHaveBeenCalled();
    expect(fixture.state()).toEqual({ status: 'pending', actionCount: 0 });
  });
  it('rejects a repeated review without executing the action again', async () => {
    const fixture = harness();
    await fixture.service.approve('org', 'request', user.id);
    await expect(
      fixture.service.approve('org', 'request', user.id),
    ).rejects.toThrow(BadRequestException);
    expect(fixture.reverse).toHaveBeenCalledTimes(1);
  });
  it('hides another agent submission in detail reads', async () => {
    const fixture = harness();
    fixture.actor.role = 'agent';
    await expect(
      fixture.service.findOne('org', 'request', { ...user, role: 'agent' }),
    ).rejects.toThrow(NotFoundException);
  });
  it('denies a branchless manager before read or review', async () => {
    const fixture = harness();
    fixture.actor.role = 'branch_manager';
    await expect(
      fixture.service.getPendingCount('org', {
        ...user,
        role: 'branch_manager',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      fixture.service.approve('org', 'request', user.id),
    ).rejects.toThrow(ForbiddenException);
    expect(fixture.reverse).not.toHaveBeenCalled();
  });
  it('restricts manager submission queries to the current branch', async () => {
    const fixture = harness();
    fixture.actor.role = 'branch_manager';
    fixture.actor.branchId = 'branch-a';
    await fixture.service.getPendingCount('org', {
      ...user,
      role: 'branch_manager',
      branchId: 'stale',
    });
    expect(fixture.tx.approvalRequest.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        submittedBy: { organizationId: 'org', branchId: 'branch-a' },
        status: 'pending',
      },
    });
  });
  it('blocks an out-of-scope target before financial execution', async () => {
    const fixture = harness();
    fixture.flags.targetExists = false;
    await expect(
      fixture.service.approve('org', 'request', user.id),
    ).rejects.toThrow(NotFoundException);
    expect(fixture.reverse).not.toHaveBeenCalled();
  });
  it('validates stored financial payloads again when approving', async () => {
    const fixture = harness();
    fixture.request.actionType = 'close_loan';
    fixture.request.payload = { preClosureAmount: -1 };
    await expect(
      fixture.service.approve('org', 'request', user.id),
    ).rejects.toThrow(BadRequestException);
    expect(fixture.close).not.toHaveBeenCalled();
    expect(fixture.tx.approvalRequest.update).not.toHaveBeenCalled();
  });
  it('returns the created request rather than an empty response', async () => {
    const fixture = harness();
    await expect(
      fixture.service.create('org', user.id, {
        actionType: 'reverse_collection',
        entityType: 'collection',
        entityId: 'collection',
        payload: {},
      }),
    ).resolves.toMatchObject({ id: 'request' });
  });
  it('rejects a mismatched entity label and malformed new payload before persistence', async () => {
    const fixture = harness();
    await expect(
      fixture.service.create('org', user.id, {
        actionType: 'close_loan',
        entityType: 'customer',
        entityId: 'loan',
        payload: {},
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      fixture.service.create('org', user.id, {
        actionType: 'restructure_loan',
        entityType: 'loan',
        entityId: 'loan',
        payload: { newTenure: 0 },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fixture.tx.approvalRequest.create).not.toHaveBeenCalled();
  });
});
