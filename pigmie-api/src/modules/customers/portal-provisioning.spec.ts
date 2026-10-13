import { CustomersService } from './customers.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { Prisma } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

const createUser = jest.fn();
const inviteUserByEmail = jest.fn();
const deleteUser = jest.fn();
const getUserById = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { createUser, inviteUserByEmail, deleteUser, getUserById } },
  }),
}));

describe('Customer portal provisioning', () => {
  const original = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    environment: process.env.APP_ENV,
  };
  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
  });
  afterAll(() => {
    for (const [key, value] of [
      ['SUPABASE_URL', original.url],
      ['SUPABASE_SERVICE_ROLE_KEY', original.key],
      ['APP_ENV', original.environment],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  });
  function harness() {
    getUserById.mockReset().mockResolvedValue({
      error: null,
      data: { user: { id: 'existing', email: 'synthetic@example.test' } },
    });
    process.env.APP_ENV = 'test';
    createUser.mockReset().mockResolvedValue({
      data: { user: { id: 'new-provider' } },
      error: null,
    });
    inviteUserByEmail.mockReset().mockResolvedValue({
      data: { user: { id: 'new-provider' } },
      error: null,
    });
    deleteUser.mockReset().mockResolvedValue({ error: null });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      staff: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ role: 'org_admin', branchId: null }),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer',
          fullName: 'Synthetic',
          email: 'synthetic@example.test',
          isActive: true,
          authUserId: null,
          portalAccessEnabled: false,
        }),
        update: jest.fn().mockResolvedValue({ id: 'customer' }),
      },
    };
    const tenant = {
      run: (
        _org: string,
        action: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => action(tx as unknown as Prisma.TransactionClient),
    };
    return {
      service: new CustomersService(
        tenant as unknown as TenantPrismaService,
        {} as EncryptionService,
      ),
      tx,
    };
  }
  const dto = { email: 'synthetic@example.test' };
  it('fails invitation and compensates only its newly created identity', async () => {
    const { service, tx } = harness();
    inviteUserByEmail.mockResolvedValue({ error: {}, data: { user: null } });
    await expect(
      service.grantPortalAccess('org', 'customer', dto, 'admin'),
    ).rejects.toThrow('Portal invitation failed');
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith('new-provider');
  });
  it('compensates database failure and reports failed cleanup', async () => {
    const { service, tx } = harness();
    tx.customer.update.mockRejectedValue(
      new Error('Synthetic database failure'),
    );
    await expect(
      service.grantPortalAccess('org', 'customer', dto, 'admin'),
    ).rejects.toThrow('Portal provisioning failed');
    expect(deleteUser).toHaveBeenCalledWith('new-provider');
    deleteUser.mockResolvedValue({ error: {} });
    await expect(
      service.grantPortalAccess('org', 'customer', dto, 'admin'),
    ).rejects.toThrow('provider reconciliation is required');
  });
  it('never deletes an existing identity on provider creation rejection', async () => {
    const { service } = harness();
    createUser.mockResolvedValue({ error: {}, data: { user: null } });
    await expect(
      service.grantPortalAccess('org', 'customer', dto, 'admin'),
    ).rejects.toThrow('Portal account creation failed');
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it.each(['grant', 'revoke'])(
    'denies %s after actor deactivation or demotion',
    async (action) => {
      const { service, tx } = harness();
      tx.staff.findFirst.mockResolvedValue(null);
      await expect(
        action === 'grant'
          ? service.grantPortalAccess('org', 'customer', dto, 'admin')
          : service.revokePortalAccess('org', 'customer', 'admin'),
      ).rejects.toThrow(ForbiddenException);
      expect(createUser).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
      expect(tx.customer.update).not.toHaveBeenCalled();
    },
  );
  it('scopes managers to their current branch and hides other customers', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      role: 'branch_manager',
      branchId: 'current',
    });
    tx.customer.findUnique.mockResolvedValue(null);
    await expect(
      service.grantPortalAccess('org', 'foreign', dto, 'manager'),
    ).rejects.toThrow(NotFoundException);
    expect(tx.customer.findUnique).toHaveBeenCalledWith({
      where: { id: 'foreign', organizationId: 'org', branchId: 'current' },
    });
    expect(createUser).not.toHaveBeenCalled();
  });
  it('retains the provider link on revocation and reuses it on reactivation', async () => {
    const { service, tx } = harness();
    const customer = {
      id: 'customer',
      fullName: 'Synthetic',
      email: dto.email,
      isActive: true,
      authUserId: 'existing',
      portalAccessEnabled: true,
    };
    tx.customer.findUnique.mockResolvedValue(customer);
    await service.revokePortalAccess('org', 'customer', 'admin');
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { portalAccessEnabled: false } }),
    );
    tx.customer.findUnique.mockResolvedValue({
      ...customer,
      portalAccessEnabled: false,
    });
    await service.grantPortalAccess('org', 'customer', dto, 'admin');
    expect(createUser).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    await expect(
      service.grantPortalAccess(
        'org',
        'customer',
        { email: 'different@example.test' },
        'admin',
      ),
    ).rejects.toThrow('existing portal account email');
  });
  it('suppresses staging invitations and selects only portal response fields', async () => {
    const { service, tx } = harness();
    process.env.APP_ENV = 'staging';
    await service.grantPortalAccess('org', 'customer', dto, 'admin');
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          email: true,
          authUserId: true,
          portalAccessEnabled: true,
        },
      }),
    );
  });
  it('does not provision an inactive customer', async () => {
    const { service, tx } = harness();
    tx.customer.findUnique.mockResolvedValue({ isActive: false });
    await expect(
      service.grantPortalAccess('org', 'customer', dto, 'admin'),
    ).rejects.toThrow('Customer is inactive');
    expect(createUser).not.toHaveBeenCalled();
  });
  it('does not reactivate a missing or mismatched retained provider identity', async () => {
    const { service, tx } = harness();
    tx.customer.findUnique.mockResolvedValue({
      id: 'customer',
      email: dto.email,
      isActive: true,
      authUserId: 'existing',
      portalAccessEnabled: false,
    });
    getUserById.mockResolvedValue({ error: {}, data: { user: null } });
    await expect(
      service.grantPortalAccess('org', 'customer', dto, 'admin'),
    ).rejects.toThrow('operator recovery');
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
