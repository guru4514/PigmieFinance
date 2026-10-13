import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { publicStaffSelect } from '../staff/staff.service';

function harness() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([
      {
        email: 'synthetic@example.test',
        confirmed: true,
        banned: false,
        provisioning: false,
      },
    ]),
    staff: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue({ id: 'admin' }),
      create: jest.fn().mockResolvedValue({ id: 'staff' }),
    },
    customer: { findUnique: jest.fn().mockResolvedValue(null) },
    organization: {
      create: jest.fn().mockResolvedValue({ id: 'org' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'org' }),
      update: jest.fn().mockResolvedValue({ id: 'org' }),
    },
    branch: {
      create: jest.fn().mockResolvedValue({ id: 'branch' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'branch' }),
      update: jest.fn().mockResolvedValue({ id: 'branch' }),
    },
  };
  const run = (
    _org: string,
    callback: (client: Prisma.TransactionClient) => Promise<unknown>,
  ) => callback(tx as unknown as Prisma.TransactionClient);
  const prisma = {
    runOnboarding: (
      _auth: string,
      _org: string,
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx as unknown as Prisma.TransactionClient),
    $transaction: (
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx as unknown as Prisma.TransactionClient),
  };
  return {
    service: new OrganizationsService(
      prisma as unknown as PrismaService,
      { run } as unknown as TenantPrismaService,
    ),
    tx,
  };
}
const dto = {
  organizationName: 'Synthetic',
  adminFullName: 'Synthetic',
  adminEmail: 'synthetic@example.test',
};
describe('Organization identity and actor authorization', () => {
  it.each(
    [
      [],
      [{ email: dto.adminEmail, confirmed: false }],
      [{ email: dto.adminEmail, confirmed: true, banned: true }],
      [{ email: dto.adminEmail, confirmed: true, provisioning: true }],
    ].map((identity) => ({ identity })),
  )('denies ineligible provider identities', async ({ identity }) => {
    const { service, tx } = harness();
    tx.$queryRaw.mockResolvedValue(identity);
    await expect(service.createOrganization('identity', dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.organization.create).not.toHaveBeenCalled();
  });
  it('rejects a forged administrator email', async () => {
    const { service, tx } = harness();
    await expect(
      service.createOrganization('identity', {
        ...dto,
        adminEmail: 'other@example.test',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.organization.create).not.toHaveBeenCalled();
  });
  it.each(['staff', 'customer'] as const)(
    'preserves existing %s links before any organization write',
    async (kind) => {
      const { service, tx } = harness();
      tx[kind].findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.createOrganization('identity', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(tx.organization.create).not.toHaveBeenCalled();
    },
  );
  it('uses verified provider email, public fields and consistent schema defaults', async () => {
    const { service, tx } = harness();
    await service.createOrganization('identity', dto);
    expect(tx.staff.create).toHaveBeenCalledWith(
      expect.objectContaining({
        select: publicStaffSelect,
        data: expect.objectContaining({
          email: dto.adminEmail,
          authUserId: 'identity',
          role: 'org_admin',
        }) as unknown,
      }),
    );
    expect(tx.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currency: 'INR',
          timezone: 'Asia/Kolkata',
        }) as unknown,
      }),
    );
  });
  it.each([
    'organization',
    'branch-create',
    'branch-update',
    'branch-delete',
    'organization-read',
    'branch-list',
    'branch-read',
  ])(
    'rejects %s for an inactive, foreign or ineligible current actor',
    async (kind) => {
      const { service, tx } = harness();
      tx.staff.findFirst.mockResolvedValue(null);
      const requests: Record<string, () => Promise<unknown>> = {
        organization: () =>
          service.updateOrganization('org', { name: 'changed' }, 'admin'),
        'branch-create': () =>
          service.createBranch('org', { name: 'Synthetic' }, 'admin'),
        'branch-update': () =>
          service.updateBranch('org', 'branch', { name: 'changed' }, 'admin'),
        'branch-delete': () => service.deleteBranch('org', 'branch', 'admin'),
        'organization-read': () => service.getMyOrganization('org', 'admin'),
        'branch-list': () => service.getBranches('org', 'admin'),
        'branch-read': () => service.getBranch('org', 'branch', 'admin'),
      };
      await expect(requests[kind]()).rejects.toThrow(ForbiddenException);
      expect(tx.organization.update).not.toHaveBeenCalled();
      expect(tx.branch.update).not.toHaveBeenCalled();
      expect(tx.branch.create).not.toHaveBeenCalled();
      expect(tx.branch.findMany).not.toHaveBeenCalled();
    },
  );
  it('keeps organization predicates on branch mutations and hides missing branches', async () => {
    const { service, tx } = harness();
    await service.updateBranch('org', 'branch', { name: 'changed' }, 'admin');
    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch', organizationId: 'org', isActive: true },
      data: { name: 'changed' },
    });
    tx.branch.findFirst.mockResolvedValue(null);
    await expect(
      service.deleteBranch('org', 'foreign', 'admin'),
    ).rejects.toThrow(NotFoundException);
  });
});
