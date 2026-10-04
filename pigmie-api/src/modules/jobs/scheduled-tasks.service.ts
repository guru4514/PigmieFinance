import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private prisma: PrismaService,
    private tenantPrisma: TenantPrismaService,
  ) {}

  // Runs daily at 1:00 AM
  @Cron('0 1 * * *')
  async markOverdueInstallments() {
    this.logger.log('Starting daily overdue detection...');
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    for (const org of orgs) {
      try {
        await this.runOverdueDetection(org.id);
      } catch (error) {
        this.logger.error(`Overdue detection failed for org ${org.id}`, error);
      }
    }
    this.logger.log('Daily overdue detection complete');
  }

  private async runOverdueDetection(organizationId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Step 1: Bulk mark overdue (no transaction needed — single atomic updateMany)
    const overdueResult = await this.prisma.loanSchedule.updateMany({
      where: {
        loan: { organizationId, status: 'active' },
        dueDate: { lt: today },
        status: { in: ['pending', 'partially_paid'] },
      },
      data: { status: 'overdue' },
    });

    // Step 2: Apply late fees — only for rows that need it
    // Fetch products with late fees configured
    const productsWithFees = await this.prisma.loanProduct.findMany({
      where: {
        organizationId,
        lateFeeValue: { gt: 0 },
      },
      select: { id: true, lateFeeType: true, lateFeeValue: true },
    });

    if (productsWithFees.length > 0) {
      // For flat fees, we can batch by product
      for (const product of productsWithFees) {
        if (product.lateFeeType === 'flat' && product.lateFeeValue) {
          await this.prisma.loanSchedule.updateMany({
            where: {
              loan: { organizationId, loanProductId: product.id, status: 'active' },
              status: 'overdue',
              dueDate: { lt: today },
            },
            data: {
              dueAmount: { increment: product.lateFeeValue.toNumber() },
            },
          });
        }
        // For percentage fees, we need to handle individually (less common)
        // but outside a single transaction to avoid timeouts
        if (product.lateFeeType === 'percentage' && product.lateFeeValue) {
          const rows = await this.prisma.loanSchedule.findMany({
            where: {
              loan: { organizationId, loanProductId: product.id, status: 'active' },
              status: 'overdue',
              dueDate: { lt: today },
            },
            select: { id: true, dueAmount: true },
          });
          for (const row of rows) {
            const fee = Math.round(row.dueAmount.toNumber() * (product.lateFeeValue.toNumber() / 100) * 100) / 100;
            if (fee > 0) {
              await this.prisma.loanSchedule.update({
                where: { id: row.id },
                data: { dueAmount: { increment: fee } },
              });
            }
          }
        }
      }
    }

    // Step 3: Default loans with 90+ days overdue
    const thresholdDate = new Date(today);
    thresholdDate.setDate(thresholdDate.getDate() - 90);

    const defaultResult = await this.prisma.loan.updateMany({
      where: {
        organizationId,
        status: 'active',
        schedule: { some: { status: 'overdue', dueDate: { lt: thresholdDate } } },
      },
      data: { status: 'defaulted' },
    });

    this.logger.log(`Org ${organizationId}: ${overdueResult.count} rows overdue, ${defaultResult.count} loans defaulted`);
  }
}
