import { Prisma } from '@prisma/client';
import { LoansService } from './loans.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

describe('Loan creation fee admission', () => {
  it.each(['processingFee', 'lateFeeValue'])(
    'rejects a legacy product with nonzero %s before writing a loan',
    async (field) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        staff: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'staff',
            role: 'org_admin',
            branchId: null,
          }),
        },
        loanProduct: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            processingFee: new Prisma.Decimal(
              field === 'processingFee' ? 1 : 0,
            ),
            lateFeeValue: new Prisma.Decimal(field === 'lateFeeValue' ? 1 : 0),
          }),
        },
        loan: { create: jest.fn() },
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
      await expect(
        service.create('org', 'staff', {
          customerId: 'customer',
          loanProductId: 'product',
          principalAmount: 100,
          tenure: 1,
        }),
      ).rejects.toThrow('unsupported fees');
      expect(tx.loan.create).not.toHaveBeenCalled();
    },
  );
});
