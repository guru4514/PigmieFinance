import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateLoanProductDto } from './dto/create-loan-product.dto';
import { LoanProductsService } from './loan-products.service';

const dto: CreateLoanProductDto = {
  name: 'Synthetic product',
  interestType: 'flat',
  interestRateAnnual: 12,
  collectionFrequency: 'monthly',
  minAmount: 100,
  maxAmount: 1000,
  minTenure: 1,
  maxTenure: 12,
};

function harness() {
  const tx = {
    $executeRaw: jest
      .fn<Promise<number>, [TemplateStringsArray, ...string[]]>()
      .mockResolvedValue(1),
    staff: { findFirst: jest.fn().mockResolvedValue({ id: 'admin' }) },
    loanProduct: {
      findFirst: jest.fn().mockResolvedValue({
        minAmount: new Prisma.Decimal(100),
        maxAmount: new Prisma.Decimal(1000),
        minTenure: 1,
        maxTenure: 12,
      }),
      create: jest
        .fn<Promise<{ id: string }>, [Prisma.LoanProductCreateArgs]>()
        .mockResolvedValue({ id: 'product' }),
      update: jest
        .fn<Promise<{ id: string }>, [Prisma.LoanProductUpdateArgs]>()
        .mockResolvedValue({ id: 'product' }),
    },
  };
  const tenant = {
    run: (
      _org: string,
      action: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => action(tx as unknown as Prisma.TransactionClient),
  };
  return {
    tx,
    service: new LoanProductsService(tenant as unknown as TenantPrismaService),
  };
}

describe('Loan product mutation authorization and bounds', () => {
  it.each(['create', 'update', 'remove'] as const)(
    'denies %s when the current active administrator cannot be found',
    async (operation) => {
      const { service, tx } = harness();
      tx.staff.findFirst.mockResolvedValue(null);
      const result =
        operation === 'create'
          ? service.create('org', dto, 'admin')
          : operation === 'update'
            ? service.update('org', 'product', { name: 'Changed' }, 'admin')
            : service.remove('org', 'product', 'admin');
      await expect(result).rejects.toThrow(ForbiddenException);
      expect(tx.staff.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'admin',
          organizationId: 'org',
          isActive: true,
          role: 'org_admin',
        },
        select: { id: true },
      });
      expect(tx.loanProduct.findFirst).not.toHaveBeenCalled();
      expect(tx.loanProduct.create).not.toHaveBeenCalled();
      expect(tx.loanProduct.update).not.toHaveBeenCalled();
    },
  );

  it('checks the administrator after locking, before creation', async () => {
    const { service, tx } = harness();
    await service.create('org', dto, 'admin');
    expect(tx.$executeRaw.mock.calls[0][0].join('?')).toContain('FOR SHARE');
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.staff.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.staff.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.loanProduct.create.mock.invocationCallOrder[0],
    );
    expect(tx.loanProduct.create.mock.calls[0][0].data.organizationId).toBe(
      'org',
    );
  });

  it.each(['update', 'remove'] as const)(
    'locks the scoped product before reading and performing %s',
    async (operation) => {
      const { service, tx } = harness();
      if (operation === 'update')
        await service.update('org', 'product', { maxAmount: 2000 }, 'admin');
      else await service.remove('org', 'product', 'admin');
      expect(tx.$executeRaw.mock.calls[1][0].join('?')).toContain('FOR UPDATE');
      expect(tx.$executeRaw.mock.calls[1].slice(1)).toEqual(['product', 'org']);
      expect(tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(
        tx.loanProduct.findFirst.mock.invocationCallOrder[0],
      );
      expect(tx.loanProduct.findFirst).toHaveBeenCalledWith({
        where: { id: 'product', organizationId: 'org' },
      });
      expect(tx.loanProduct.update.mock.calls[0][0].where).toEqual({
        id: 'product',
        organizationId: 'org',
      });
    },
  );

  it.each(['update', 'remove'] as const)(
    'rejects a missing or foreign product on %s',
    async (operation) => {
      const { service, tx } = harness();
      tx.loanProduct.findFirst.mockResolvedValue(null);
      await expect(
        operation === 'update'
          ? service.update('org', 'product', {}, 'admin')
          : service.remove('org', 'product', 'admin'),
      ).rejects.toThrow(NotFoundException);
      expect(tx.loanProduct.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    { minAmount: 1001 },
    { maxAmount: 99 },
    { minTenure: 13 },
    { maxTenure: 0 },
  ])(
    'rejects invalid partial bounds %j against the locked record',
    async (change) => {
      const { service, tx } = harness();
      await expect(
        service.update('org', 'product', change, 'admin'),
      ).rejects.toThrow(BadRequestException);
      expect(tx.loanProduct.update).not.toHaveBeenCalled();
    },
  );
});
