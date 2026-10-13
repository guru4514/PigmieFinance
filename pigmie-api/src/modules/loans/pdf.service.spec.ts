import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PdfService } from './pdf.service';

describe('Loan statement ownership', () => {
  const findUnique = jest.fn();
  const run = jest.fn(
    async <T>(
      _organizationId: string,
      callback: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> =>
      callback({ loan: { findUnique } } as unknown as Prisma.TransactionClient),
  );
  const service = new PdfService({ run } as unknown as TenantPrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['another customer', 'org-a', 'customer-b'],
    ['another organization', 'org-b', 'customer-a'],
    ['missing loan', 'org-a', 'customer-a'],
  ])('rejects %s without generating a PDF', async (_, orgId, customerId) => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.generateLoanStatement('loan-a', orgId, customerId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(run).toHaveBeenCalledWith(orgId, expect.any(Function));
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loan-a', organizationId: orgId, customerId },
      }),
    );
  });

  it('generates a PDF for the customer-owned loan', async () => {
    findUnique.mockResolvedValue({
      organization: { name: 'Test lender' },
      customer: { fullName: 'Test borrower', phone: '0000000000' },
      loanCode: 'LN-TEST',
      principalAmount: new Prisma.Decimal(100),
      interestRateAnnual: new Prisma.Decimal(0),
      interestType: 'flat',
      tenure: 1,
      collectionFrequency: 'monthly',
      totalPayable: new Prisma.Decimal(100),
      outstandingBalance: new Prisma.Decimal(100),
      schedule: [],
      collections: [],
    });

    const pdf = await service.generateLoanStatement(
      'loan-a',
      'org-a',
      'customer-a',
    );

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'loan-a',
          organizationId: 'org-a',
          customerId: 'customer-a',
        },
      }),
    );
  });

  it('preserves the existing organization-scoped staff caller contract', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.generateLoanStatement('loan-a', 'org-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loan-a', organizationId: 'org-a' },
      }),
    );
  });
});
