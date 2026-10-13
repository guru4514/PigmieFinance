import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StaffService, publicStaffSelect } from './staff.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const createUser = jest.fn();
const inviteUserByEmail = jest.fn();
const deleteUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { createUser, inviteUserByEmail, deleteUser } },
  }),
}));

function harness() {
  createUser.mockReset().mockResolvedValue({
    data: { user: { id: 'new-auth-user' } },
    error: null,
  });
  inviteUserByEmail.mockReset().mockResolvedValue({
    data: { user: { id: 'new-auth-user' } },
    error: null,
  });
  deleteUser.mockReset().mockResolvedValue({ error: null });
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    staff: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'admin', role: 'org_admin' }),
      create: jest.fn().mockResolvedValue({ id: 'created-staff' }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'staff',
        branchId: 'branch-a',
        role: 'agent',
        isActive: true,
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ id: 'staff' }),
    },
    branch: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const tenant = {
    run: (
      _org: string,
      action: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => action(tx as unknown as Prisma.TransactionClient),
  };
  return {
    service: new StaffService(tenant as unknown as TenantPrismaService),
    tx,
  };
}

describe('Staff disclosure and branch scope', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalEnvironment = process.env.APP_ENV;
  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
    process.env.APP_ENV = 'test';
  });
  afterAll(() => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    if (originalEnvironment === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalEnvironment;
  });
  it('explicitly excludes the stored authenticator secret from public fields', async () => {
    expect(publicStaffSelect).not.toHaveProperty('twoFactorSecret');
    const { service, tx } = harness();
    await service.findAll('org', {}, 'admin');
    expect(tx.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: publicStaffSelect }),
    );
    await service.updateOwnPhone('org', 'staff', '123');
    expect(tx.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ select: publicStaffSelect }),
    );
  });
  it('denies manager lists without an assigned branch', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'manager',
      branchId: null,
      role: 'branch_manager',
      isActive: true,
    });
    await expect(service.findAll('org', {}, 'manager')).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.staff.findMany).not.toHaveBeenCalled();
  });
  it('ignores a forged branch filter and uses the current manager branch', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'manager',
      role: 'branch_manager',
      branchId: 'branch-a',
    });
    await service.findAll('org', { branchId: 'branch-b' }, 'manager');
    expect(tx.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org', branchId: 'branch-a' },
      }),
    );
  });
  it('denies a branchless manager before reading details', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'staff',
      branchId: null,
      role: 'branch_manager',
      isActive: true,
    });
    await expect(service.findOne('org', 'staff', 'manager')).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.staff.findUnique).not.toHaveBeenCalled();
  });
  it.each(['list', 'detail'] as const)(
    'denies %s for an inactive, foreign or demoted directory actor',
    async (operation) => {
      const { service, tx } = harness();
      tx.staff.findFirst.mockResolvedValue(null);
      await expect(
        operation === 'list'
          ? service.findAll('org', {}, 'admin')
          : service.findOne('org', 'staff', 'admin'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.staff.findMany).not.toHaveBeenCalled();
      expect(tx.staff.findUnique).not.toHaveBeenCalled();
      expect(tx.staff.count).not.toHaveBeenCalled();
    },
  );
  it('uses current manager scope on details and hides inaccessible targets', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      id: 'admin',
      role: 'branch_manager',
      branchId: 'new-branch',
    });
    tx.staff.findUnique.mockResolvedValue(null);
    await expect(service.findOne('org', 'foreign', 'admin')).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.staff.findUnique).toHaveBeenCalledWith({
      where: { id: 'foreign', organizationId: 'org', branchId: 'new-branch' },
      select: publicStaffSelect,
    });
  });
  it('allows administrator filters to narrow the organization directory', async () => {
    const { service, tx } = harness();
    await service.findAll(
      'org',
      { branchId: 'selected', role: 'agent', isActive: false },
      'admin',
    );
    expect(tx.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          branchId: 'selected',
          role: 'agent',
          isActive: false,
        },
      }),
    );
    await service.findOne('org', 'staff', 'admin');
    expect(tx.staff.findUnique).toHaveBeenCalledWith({
      where: { id: 'staff', organizationId: 'org' },
      select: publicStaffSelect,
    });
  });
  it('rejects a foreign branch before creating a provider account', async () => {
    const { service } = harness();
    createUser.mockClear();
    await expect(
      service.create(
        'org',
        {
          email: 'synthetic@example.test',
          fullName: 'Synthetic',
          role: 'agent',
          branchId: 'foreign',
        },
        'admin',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(createUser).not.toHaveBeenCalled();
  });
  it('rejects promoting a branchless active manager before writing', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue({
      id: 'staff',
      branchId: null,
      role: 'agent',
      isActive: true,
    });
    await expect(
      service.update('org', 'staff', { role: 'branch_manager' }, 'admin'),
    ).rejects.toThrow(BadRequestException);
    expect(tx.staff.update).not.toHaveBeenCalled();
  });
  it.each(['update', 'remove'] as const)(
    'denies %s when the actor is inactive or outside the organization',
    async (operation) => {
      const { service, tx } = harness();
      tx.staff.findFirst.mockResolvedValue(null);
      await expect(
        operation === 'update'
          ? service.update(
              'org',
              'staff',
              { fullName: 'Synthetic change' },
              'admin',
            )
          : service.remove('org', 'staff', 'admin'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.staff.update).not.toHaveBeenCalled();
    },
  );
  it.each(['update', 'remove'] as const)(
    'denies %s after administrator demotion',
    async (operation) => {
      const { service, tx } = harness();
      tx.staff.findFirst.mockResolvedValue({ id: 'admin', role: 'agent' });
      await expect(
        operation === 'update'
          ? service.update(
              'org',
              'staff',
              { fullName: 'Synthetic change' },
              'admin',
            )
          : service.remove('org', 'staff', 'admin'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.staff.update).not.toHaveBeenCalled();
    },
  );
  it('allows an active agent to update only their own phone', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({ id: 'staff', role: 'agent' });
    await service.update('org', 'staff', { phone: '0000000001' }, 'staff');
    expect(tx.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'staff', organizationId: 'org' },
        data: { phone: '0000000001' },
      }),
    );
    tx.staff.update.mockClear();
    await expect(
      service.update(
        'org',
        'staff',
        { phone: '0000000002', role: 'org_admin' },
        'staff',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.staff.update).not.toHaveBeenCalled();
  });
  it('denies empty self patches and phone writes after deactivation', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue(null);
    await expect(service.update('org', 'staff', {}, 'staff')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.updateOwnPhone('org', 'staff', '0000000001'),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.staff.update).not.toHaveBeenCalled();
  });
  it('does not update or remove a missing organization-owned target', async () => {
    const { service, tx } = harness();
    tx.staff.findUnique.mockResolvedValue(null);
    await expect(
      service.update('org', 'foreign', { phone: '0000000001' }, 'admin'),
    ).rejects.toThrow(NotFoundException);
    await expect(service.remove('org', 'foreign', 'admin')).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.staff.update).not.toHaveBeenCalled();
  });
  it('soft-removes staff without deleting the provider identity or records', async () => {
    const { service, tx } = harness();
    await service.remove('org', 'staff', 'admin');
    expect(tx.staff.update).toHaveBeenCalledWith({
      select: publicStaffSelect,
      where: { id: 'staff', organizationId: 'org' },
      data: { isActive: false },
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });
  const fixture = {
    email: 'synthetic@example.test',
    fullName: 'Synthetic',
    role: 'agent' as const,
  };
  it('rejects an administrator deactivated or demoted after authentication', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue(null);
    await expect(service.create('org', fixture, 'admin')).rejects.toThrow(
      ForbiddenException,
    );
    expect(createUser).not.toHaveBeenCalled();
  });
  it('fails invitation and removes only the provider account created by this attempt', async () => {
    const { service, tx } = harness();
    inviteUserByEmail.mockResolvedValue({
      error: { message: 'Synthetic failure' },
      data: { user: null },
    });
    await expect(service.create('org', fixture, 'admin')).rejects.toThrow(
      'Staff invitation failed',
    );
    expect(tx.staff.create).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith('new-auth-user');
  });
  it('compensates a database write failure after provider creation', async () => {
    const { service, tx } = harness();
    tx.staff.create.mockRejectedValue(new Error('Synthetic failure'));
    await expect(service.create('org', fixture, 'admin')).rejects.toThrow(
      'Staff provisioning failed',
    );
    expect(deleteUser).toHaveBeenCalledWith('new-auth-user');
  });
  it('does not delete an existing provider identity when creation is rejected', async () => {
    const { service } = harness();
    createUser.mockResolvedValue({
      error: { message: 'Synthetic conflict' },
      data: { user: null },
    });
    await expect(service.create('org', fixture, 'admin')).rejects.toThrow(
      'Provider account creation failed',
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('reports failed compensation instead of claiming cleanup succeeded', async () => {
    const { service, tx } = harness();
    tx.staff.create.mockRejectedValue(new Error('Synthetic failure'));
    deleteUser.mockResolvedValue({ error: { message: 'Synthetic failure' } });
    await expect(service.create('org', fixture, 'admin')).rejects.toThrow(
      'provider reconciliation is required',
    );
  });
  it('creates synthetic staging staff without invitation delivery', async () => {
    const { service, tx } = harness();
    process.env.APP_ENV = 'staging';
    try {
      await service.create('org', fixture, 'admin');
      expect(tx.staff.create).toHaveBeenCalled();
      expect(inviteUserByEmail).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
    } finally {
      process.env.APP_ENV = 'test';
    }
  });
});
