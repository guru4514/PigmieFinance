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

    // Step 1: Apply late fees ONCE for schedules that are BECOMING overdue today
    // Fetch products with late fees configured
    const productsWithFees = await this.prisma.loanProduct.findMany({
      where: { organizationId, lateFeeValue: { gt: 0 } },
      select: { id: true, lateFeeType: true, lateFeeValue: true },
    });

    if (productsWithFees.length > 0) {
      for (const product of productsWithFees) {
        if (product.lateFeeType === 'flat' && product.lateFeeValue) {
          // Apply flat fee exactly once before marking overdue
          await this.prisma.loanSchedule.updateMany({
            where: {
              loan: { organizationId, loanProductId: product.id, status: 'active' },
              status: { in: ['pending', 'partially_paid'] },
              dueDate: { lt: today },
            },
            data: { dueAmount: { increment: product.lateFeeValue.toNumber() } },
          });
        }
        if (product.lateFeeType === 'percentage' && product.lateFeeValue) {
          const rows = await this.prisma.loanSchedule.findMany({
            where: {
              loan: { organizationId, loanProductId: product.id, status: 'active' },
              status: { in: ['pending', 'partially_paid'] },
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

    // Step 2: Bulk mark overdue (now that penalties are applied)
    const overdueResult = await this.prisma.loanSchedule.updateMany({
      where: {
        loan: { organizationId, status: 'active' },
        dueDate: { lt: today },
        status: { in: ['pending', 'partially_paid'] },
      },
      data: { status: 'overdue' },
    });

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

  // Runs daily at 2:00 AM to purge old audit logs and prevent DB bloat
  @Cron('0 2 * * *')
  async archiveOldAuditLogs() {
    this.logger.log('Starting daily audit log purge...');
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });
      this.logger.log(`Successfully purged ${result.count} audit logs older than 90 days.`);
    } catch (error) {
      this.logger.error('Failed to purge old audit logs', error);
    }
  }
}
