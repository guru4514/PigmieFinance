jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { StaffUser } from '../../common/types/request-user.type';

describe('Customer write assignment boundaries', () => {
  const actor: StaffUser = {
    type: 'staff',
    id: 'agent',
    organizationId: 'org',
    role: 'agent',
    branchId: 'branch',
  };
  const findCustomer = jest.fn();
  const findStaff = jest.fn();
  const findBranch = jest.fn();
  const create = jest.fn<Promise<unknown>, [{ data: unknown }]>();
  const createMany = jest.fn();
  const update = jest.fn();
  const updateLoans = jest.fn();
  const groupBy = jest.fn();
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    customer: { findUnique: findCustomer, create, createMany, update, groupBy },
    staff: { findUnique: findStaff, findFirst: findStaff },
    branch: { findFirst: findBranch },
    loan: { updateMany: updateLoans },
  } as unknown as Prisma.TransactionClient;
  let service: CustomersService;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://synthetic.invalid';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-key';
  });
  afterAll(() => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });
  beforeEach(() => {
    jest.resetAllMocks();
    service = new CustomersService(
      {
        run: <T>(
          _org: string,
          action: (client: Prisma.TransactionClient) => Promise<T>,
        ) => action(tx),
      } as TenantPrismaService,
      {} as EncryptionService,
    );
    findCustomer.mockResolvedValue({
      id: 'customer',
      assignedAgentId: 'agent',
      branchId: 'branch',
    });
    findStaff.mockResolvedValue({
      id: 'agent',
      role: 'agent',
      isActive: true,
      branchId: 'branch',
    });
    findBranch.mockResolvedValue({ id: 'branch' });
    create.mockImplementation((args: { data: unknown }) =>
      Promise.resolve(args.data),
    );
    update.mockResolvedValue({ id: 'customer' });
    createMany.mockResolvedValue({ count: 2 });
    groupBy.mockResolvedValue([]);
  });
  it('assigns agent-created customers to the actor and their branch by default', async () => {
    await service.create(
      'org',
      { fullName: 'Synthetic borrower', phone: '0000000000' },
      actor,
    );
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        assignedAgentId: 'agent',
        branchId: 'branch',
      },
    });
    expect(findStaff).toHaveBeenCalledWith({
      where: {
        id: 'agent',
        organizationId: 'org',
        isActive: true,
        role: 'agent',
        branchId: 'branch',
      },
      select: { id: true },
    });
  });
  it.each([{ assignedAgentId: 'other-agent' }, { branchId: 'other-branch' }])(
    'rejects agent creation outside the actor scope %j',
    async (changes) => {
      await expect(
        service.create(
          'org',
          { fullName: 'Sample', phone: '0000000000', ...changes },
          actor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each([{ assignedAgentId: 'other-agent' }, { branchId: 'other-branch' }])(
    'rejects reassignment through a normal agent update %j',
    async (changes) => {
      await expect(
        service.update('org', 'customer', changes, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    },
  );
  it('keeps contact updates possible without revalidating unchanged assignments', async () => {
    await service.update('org', 'customer', { phone: '0000000001' }, actor);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'customer', organizationId: 'org' },
      data: { phone: '0000000001' },
    });
    expect(findStaff).toHaveBeenCalledTimes(1);
    expect(findStaff).toHaveBeenCalledWith({
      where: { id: actor.id, organizationId: 'org', isActive: true },
    });
  });
  it('defaults manager-created customers to their branch', async () => {
    await service.create(
      'org',
      { fullName: 'Sample', phone: '0000000000' },
      { ...actor, role: 'branch_manager' },
    );
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: { branchId: 'branch' },
    });
  });
  it('rejects manager writes to another branch and managers without an assignment', async () => {
    await expect(
      service.create(
        'org',
        { fullName: 'Sample', phone: '0000000000', branchId: 'other' },
        { ...actor, role: 'branch_manager' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(
        'org',
        { fullName: 'Sample', phone: '0000000000' },
        { ...actor, role: 'branch_manager', branchId: null },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });
  it('validates organization-owned branches and active agent assignments for administrators', async () => {
    findBranch.mockResolvedValue(null);
    await expect(
      service.create(
        'org',
        { fullName: 'Sample', phone: '0000000000', branchId: 'foreign' },
        { ...actor, role: 'org_admin' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    findBranch.mockResolvedValue({ id: 'branch' });
    findStaff.mockResolvedValue(null);
    await expect(
      service.create(
        'org',
        {
          fullName: 'Sample',
          phone: '0000000000',
          branchId: 'branch',
          assignedAgentId: 'foreign',
        },
        { ...actor, role: 'org_admin' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
  it('validates all bulk rows before creating any records', async () => {
    await expect(
      service.bulkCreate(
        'org',
        {
          customers: [
            { fullName: 'Sample A', phone: '0000000000' },
            { fullName: 'Sample B', phone: '0000000001', branchId: 'foreign' },
          ],
        },
        { ...actor, role: 'branch_manager' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createMany).not.toHaveBeenCalled();
  });
  it.each(['agent', 'branch_manager', 'org_admin'] as const)(
    'scopes KYC summaries for %s',
    async (role) => {
      await service.getKycSummary('org', { ...actor, role });
      expect(groupBy).toHaveBeenCalledWith({
        by: ['kycStatus'],
        where: {
          organizationId: 'org',
          ...(role === 'agent' ? { assignedAgentId: 'agent' } : {}),
          ...(role === 'branch_manager' ? { branchId: 'branch' } : {}),
        },
        _count: { id: true },
      });
    },
  );
  it.each(['invented_status', null, 123])(
    'rejects invalid KYC status %j before database mutation',
    async (status) => {
      await expect(
        service.updateKycStatus('org', 'customer', status),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    },
  );
  it('keeps pending and approved loan assignments consistent after administrator reassignment', async () => {
    findStaff.mockResolvedValueOnce({
      id: 'agent',
      role: 'org_admin',
      isActive: true,
      branchId: 'branch',
    });
    await service.update(
      'org',
      'customer',
      { assignedAgentId: 'new-agent' },
      { ...actor, role: 'org_admin' },
    );
    expect(updateLoans).toHaveBeenCalledWith({
      where: {
        customerId: 'customer',
        organizationId: 'org',
        status: { in: ['pending_approval', 'active', 'approved'] },
      },
      data: { assignedAgentId: 'new-agent' },
    });
  });
  it('rejects staff deactivated after the route guard', async () => {
    findStaff.mockResolvedValue(null);
    await expect(
      service.update('org', 'customer', { phone: '0000000001' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
  it('uses the current role instead of stale administrator permissions', async () => {
    await expect(
      service.update(
        'org',
        'customer',
        { assignedAgentId: 'other-agent' },
        { ...actor, role: 'org_admin' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
    expect(updateLoans).not.toHaveBeenCalled();
  });
  it('uses the current manager branch instead of a stale branch claim', async () => {
    findStaff.mockResolvedValue({
      id: 'agent',
      role: 'branch_manager',
      isActive: true,
      branchId: 'new-branch',
    });
    await expect(
      service.update(
        'org',
        'customer',
        { phone: '0000000001' },
        { ...actor, role: 'branch_manager' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects a customer reassigned after the route guard', async () => {
    findCustomer.mockResolvedValue({
      id: 'customer',
      assignedAgentId: 'other-agent',
      branchId: 'branch',
    });
    await expect(
      service.update('org', 'customer', { phone: '0000000001' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
});
