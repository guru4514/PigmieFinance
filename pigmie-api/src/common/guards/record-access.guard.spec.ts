import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { RecordAccessGuard } from './record-access.guard';
import {
  RecordAccess,
  RecordAccessRule,
} from '../decorators/record-access.decorator';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { RequestUser, StaffUser } from '../types/request-user.type';

const id = '00000000-0000-4000-8000-000000000001';
const agent: StaffUser = {
  type: 'staff',
  id: 'agent',
  organizationId: 'org',
  branchId: 'branch',
  role: 'agent',
};
describe('Record scope enforcement', () => {
  const findFirst = jest.fn<Promise<{ id: string } | null>, [unknown]>();
  const tx = {
    customer: { findFirst },
    loan: { findFirst },
    collection: { findFirst },
  } as unknown as Prisma.TransactionClient;
  const run = jest.fn(
    async <T>(
      _org: string,
      action: (tx: Prisma.TransactionClient) => Promise<T>,
    ) => action(tx),
  );
  const guard = new RecordAccessGuard(new Reflector(), {
    run,
  } as unknown as TenantPrismaService);
  function context(
    rule: RecordAccessRule | undefined,
    user: RequestUser | undefined = agent,
    params: Record<string, unknown> = { id },
    body?: unknown,
  ) {
    class Controller {}
    if (rule) RecordAccess(rule)(Controller);
    return {
      getClass: () => Controller,
      getHandler: () => function handler() {},
      switchToHttp: () => ({ getRequest: () => ({ user, params, body }) }),
    } as unknown as ExecutionContext;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue({ id });
  });
  it.each(['customer', 'loan', 'collection'] as const)(
    'scopes agent %s queries to the organization and assignment',
    async (resource) => {
      await guard.canActivate(context({ resource }));
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id,
          organizationId: 'org',
          [resource === 'collection' ? 'collectedById' : 'assignedAgentId']:
            'agent',
        },
        select: { id: true },
      });
      expect(run).toHaveBeenCalledWith('org', expect.any(Function));
    },
  );
  it.each(['customer', 'loan', 'collection'] as const)(
    'scopes manager %s queries to their branch',
    async (resource) => {
      await guard.canActivate(
        context({ resource }, { ...agent, role: 'branch_manager' }),
      );
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id,
          organizationId: 'org',
          ...(resource === 'customer'
            ? { branchId: 'branch' }
            : { customer: { branchId: 'branch' } }),
        },
        select: { id: true },
      });
    },
  );
  it.each(['org_admin', 'accountant'] as const)(
    'preserves organization-wide record reads for %s',
    async (role) => {
      await guard.canActivate(
        context({ resource: 'loan' }, { ...agent, role }),
      );
      expect(findFirst).toHaveBeenCalledWith({
        where: { id, organizationId: 'org' },
        select: { id: true },
      });
    },
  );
  it.each(['customer', 'loan', 'collection'] as const)(
    'denies a manager without a branch even on the %s list',
    async (resource) => {
      await expect(
        guard.canActivate(
          context(
            { resource },
            { ...agent, role: 'branch_manager', branchId: null },
            {},
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(run).not.toHaveBeenCalled();
    },
  );
  it('denies inaccessible records without disclosing whether they exist', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(context({ resource: 'loan' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('permits only a matching original payment retry after a loan is reassigned', async () => {
    const payment = {
      loanId: id,
      clientGeneratedId: '00000000-0000-4000-8000-000000000003',
      amount: 100,
      collectionDate: '2026-10-10',
      collectionMethod: 'cash',
    };
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id });
    await expect(
      guard.canActivate(
        context(
          {
            resource: 'loan',
            source: 'body',
            field: 'loanId',
            allowRecordedRetry: true,
          },
          agent,
          {},
          payment,
        ),
      ),
    ).resolves.toBe(true);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        ...payment,
        organizationId: 'org',
        collectedById: 'agent',
        collectionDate: new Date('2026-10-10T00:00:00.000Z'),
      },
      select: { id: true },
    });
  });
  it('denies a new or conflicting payment on a reassigned loan', async () => {
    findFirst.mockResolvedValue(null);
    const payment = {
      loanId: id,
      clientGeneratedId: '00000000-0000-4000-8000-000000000003',
      amount: 200,
      collectionDate: '2026-10-10',
      collectionMethod: 'cash',
    };
    await expect(
      guard.canActivate(
        context(
          {
            resource: 'loan',
            source: 'body',
            field: 'loanId',
            allowRecordedRetry: true,
          },
          agent,
          {},
          payment,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      findFirst.mock.calls[findFirst.mock.calls.length - 1]?.[0],
    ).toMatchObject({
      where: { amount: 200, collectedById: 'agent', organizationId: 'org' },
    });
  });
  it('checks body-selected customers for loan creation', async () => {
    await guard.canActivate(
      context(
        { resource: 'customer', source: 'body', field: 'customerId' },
        agent,
        {},
        { customerId: id, organizationId: 'forged-org' },
      ),
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, organizationId: 'org', assignedAgentId: 'agent' },
      }),
    );
  });
  it('checks every distinct loan in a sync batch before permitting the handler', async () => {
    const second = '00000000-0000-4000-8000-000000000002';
    findFirst.mockResolvedValueOnce({ id }).mockResolvedValueOnce(null);
    await expect(
      guard.canActivate(
        context(
          { resource: 'loan', source: 'collections' },
          agent,
          {},
          { collections: [{ loanId: id }, { loanId: id }, { loanId: second }] },
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
  it.each([
    undefined,
    { collections: [] },
    { collections: [null] },
    { collections: 'bad' },
    { collections: Array.from({ length: 101 }, () => ({ loanId: id })) },
  ])('rejects malformed or oversized sync input %j', async (body) => {
    await expect(
      guard.canActivate(
        context({ resource: 'loan', source: 'collections' }, agent, {}, body),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(run).not.toHaveBeenCalled();
  });
  it('fails closed without access metadata or a staff account', async () => {
    await expect(guard.canActivate(context(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      guard.canActivate(
        context(
          { resource: 'loan' },
          { type: 'unprovisioned', authUserId: 'auth' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.canActivate(
        context(
          { resource: 'loan' },
          { type: 'customer', id, organizationId: 'org' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const noUser = context({ resource: 'loan' });
    jest
      .spyOn(noUser, 'switchToHttp')
      .mockReturnValue({ getRequest: () => ({ params: { id } }) } as ReturnType<
        ExecutionContext['switchToHttp']
      >);
    await expect(guard.canActivate(noUser)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
