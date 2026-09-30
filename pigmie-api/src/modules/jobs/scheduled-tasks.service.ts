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
    await this.tenantPrisma.run(organizationId, async (tx) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 1. Find pending/partially_paid schedule rows where dueDate < today
      const overdueRows = await tx.loanSchedule.findMany({
        where: {
          loan: { organizationId, status: 'active' },
          dueDate: { lt: today },
          status: { in: ['pending', 'partially_paid'] },
        },
        include: { loan: { include: { loanProduct: true } } },
      });

      // 2. Mark as overdue + apply late fees
      for (const row of overdueRows) {
        const product = row.loan.loanProduct;
        let lateFee = 0;

        if (product.lateFeeValue && product.lateFeeValue.toNumber() > 0) {
          if (product.lateFeeType === 'flat') {
            lateFee = product.lateFeeValue.toNumber();
          } else if (product.lateFeeType === 'percentage') {
            lateFee = row.dueAmount.toNumber() * (product.lateFeeValue.toNumber() / 100);
          }
          lateFee = Math.round(lateFee * 100) / 100;
        }

        await tx.loanSchedule.update({
          where: { id: row.id },
          data: {
            status: 'overdue',
            ...(lateFee > 0 ? { dueAmount: { increment: lateFee } } : {}),
          },
        });
      }

      // 3. Default loans with 90+ days overdue
      const defaultThresholdDays = 90;
      const thresholdDate = new Date(today);
      thresholdDate.setDate(thresholdDate.getDate() - defaultThresholdDays);

      const loansToDefault = await tx.loan.findMany({
        where: {
          organizationId,
          status: 'active',
          schedule: { some: { status: 'overdue', dueDate: { lt: thresholdDate } } },
        },
      });

      for (const loan of loansToDefault) {
        await tx.loan.update({
          where: { id: loan.id },
          data: { status: 'defaulted' },
        });
      }

      this.logger.log(`Org ${organizationId}: ${overdueRows.length} rows overdue, ${loansToDefault.length} loans defaulted`);
    });
  }
}
