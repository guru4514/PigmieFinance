import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { calculateLateFee } from '../modules/collections/utils/late-fee.util';

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Cron('0 1 * * *')
  async markOverdueInstallments() {
    this.logger.log('Starting daily overdue detection...');
    const organizations = await this.prisma.organization.findMany({ where: { isActive: true } });
    for (const org of organizations) {
      try {
        await this.tenantPrisma.run(org.id, async (tx) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          // Find overdue schedule rows
          const overdueRows = await tx.loanSchedule.findMany({
            where: { status: { in: ['pending', 'partially_paid'] }, dueDate: { lt: today } },
            include: { loan: { include: { loanProduct: true } } },
          });
          
          for (const row of overdueRows) {
            let newDueAmount = row.dueAmount.toNumber();
            const product = row.loan.loanProduct;
            if (product.lateFeeValue.toNumber() > 0) {
              const fee = calculateLateFee(row.dueAmount.toNumber(), product.lateFeeType as 'flat' | 'percentage', product.lateFeeValue.toNumber());
              newDueAmount += fee;
            }
            await tx.loanSchedule.update({
              where: { id: row.id },
              data: { status: 'overdue', dueAmount: newDueAmount },
            });
            
            // Optional: write audit log
              await tx.auditLog.create({
                data: {
                  organizationId: org.id,
                  actorStaffId: null,
                  action: 'loan_schedule.overdue',
                  entityType: 'LoanSchedule',
                  entityId: row.id,
                  newValue: { previousStatus: row.status, newStatus: 'overdue', newDueAmount },
                  ipAddress: 'system'
                }
              });
          }
          
          // Auto-default loans
          const activeLoans = await tx.loan.findMany({
            where: { status: 'active' },
            include: { schedule: { where: { status: 'overdue' } } },
          });
          
          for (const loan of activeLoans) {
            if (loan.schedule.length > 0) {
              const maxOverdueDays = Math.max(...loan.schedule.map(s => {
                const due = new Date(s.dueDate);
                return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
              }));
              
              if (maxOverdueDays > 90) {
                await tx.loan.update({ where: { id: loan.id }, data: { status: 'defaulted' } });
                await tx.auditLog.create({
                  data: {
                    organizationId: org.id,
                    actorStaffId: null,
                    action: 'loan.defaulted',
                    entityType: 'Loan',
                    entityId: loan.id,
                    newValue: { reason: 'Exceeded 90 days overdue threshold' },
                    ipAddress: 'system'
                  }
                });
              }
            }
          }
        });
      } catch (error) {
        this.logger.error(`Overdue detection failed for org ${org.id}`, error);
      }
    }
    this.logger.log('Daily overdue detection complete.');
  }
}

