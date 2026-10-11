import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { businessDate } from '../loans/utils/date.util';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'Asia/Kolkata', waitForCompletion: true })
  async markOverdueInstallments() {
    const today = businessDate();
    const threshold = new Date(today.getTime() - 90 * 86400000);
    const organizations = await this.prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const organization of organizations) {
      try {
        const loans = await this.prisma.loan.findMany({
          where: {
            organizationId: organization.id,
            status: 'active',
            schedule: {
              some: {
                dueDate: { lt: today },
                status: { in: ['pending', 'partially_paid', 'overdue'] },
              },
            },
          },
          select: { id: true },
        });
        for (const candidate of loans) {
          try {
            await this.tenantPrisma.run(
              organization.id,
              async (tx) => {
                // Collection posting, reversal and pre-closure acquire this same lock first.
                await tx.$executeRaw`SELECT 1 FROM loans WHERE id = ${candidate.id}::uuid AND organization_id = ${organization.id}::uuid FOR UPDATE`;
                const loan = await tx.loan.findFirst({
                  where: {
                    id: candidate.id,
                    organizationId: organization.id,
                    status: 'active',
                  },
                  include: { loanProduct: true },
                });
                if (!loan) return;
                const rows = await tx.loanSchedule.findMany({
                  where: {
                    loanId: loan.id,
                    dueDate: { lt: today },
                    status: { in: ['pending', 'partially_paid'] },
                  },
                  orderBy: { installmentNumber: 'asc' },
                });
                const markers = await tx.auditLog.findMany({
                  where: {
                    organizationId: organization.id,
                    action: 'loan_schedule.overdue',
                    entityType: 'LoanSchedule',
                    entityId: { in: rows.map((row) => row.id) },
                  },
                  select: { entityId: true },
                });
                const marked = new Set(
                  markers.map((marker) => marker.entityId),
                );
                let totalFees = new Prisma.Decimal(0);
                for (const row of rows) {
                  if (row.paidAmount.gte(row.dueAmount)) {
                    await tx.loanSchedule.update({
                      where: { id: row.id },
                      data: { status: 'paid' },
                    });
                    continue;
                  }
                  const marker = marked.has(row.id);
                  // Preserve evidence of legacy fees even when an old job wrote no audit marker.
                  const existingFee = row.dueAmount.gt(
                    row.principalComponent.plus(row.interestComponent),
                  );
                  let fee = new Prisma.Decimal(0);
                  if (!marker && !existingFee) {
                    const value = loan.loanProduct.lateFeeValue;
                    fee =
                      loan.loanProduct.lateFeeType === 'flat'
                        ? value
                        : row.dueAmount.mul(value).div(100);
                    fee = Prisma.Decimal.max(0, fee).toDecimalPlaces(2);
                  }
                  await tx.loanSchedule.update({
                    where: { id: row.id },
                    data: { status: 'overdue', dueAmount: { increment: fee } },
                  });
                  totalFees = totalFees.plus(fee);
                  if (!marker) {
                    await tx.auditLog.create({
                      data: {
                        organizationId: organization.id,
                        actorStaffId: null,
                        action: 'loan_schedule.overdue',
                        entityType: 'LoanSchedule',
                        entityId: row.id,
                        newValue: {
                          previousStatus: row.status,
                          fee: fee.toString(),
                          legacyFeeDetected: existingFee,
                        },
                        ipAddress: 'system',
                      },
                    });
                  }
                }
                if (totalFees.gt(0))
                  await tx.loan.update({
                    where: { id: loan.id },
                    data: {
                      totalPayable: { increment: totalFees },
                      outstandingBalance: { increment: totalFees },
                    },
                  });
                const severelyOverdue = await tx.loanSchedule.count({
                  where: {
                    loanId: loan.id,
                    status: 'overdue',
                    dueDate: { lt: threshold },
                  },
                });
                if (severelyOverdue > 0) {
                  await tx.loan.update({
                    where: { id: loan.id },
                    data: { status: 'defaulted' },
                  });
                  await tx.auditLog.create({
                    data: {
                      organizationId: organization.id,
                      actorStaffId: null,
                      action: 'loan.defaulted',
                      entityType: 'Loan',
                      entityId: loan.id,
                      newValue: {
                        reason: 'Exceeded 90 days overdue threshold',
                      },
                      ipAddress: 'system',
                    },
                  });
                }
              },
              { timeout: 60000 },
            );
          } catch {
            this.logger.error(
              `Overdue processing failed for loan ${candidate.id}`,
            );
          }
        }
      } catch {
        this.logger.error(
          `Overdue processing failed for organization ${organization.id}`,
        );
      }
    }
  }

  // Retained for callers, but no scheduled deletion: these records include fee idempotency evidence.
  archiveOldAuditLogs(): void {
    this.logger.warn(
      'Audit deletion is disabled until a verified archival and retention policy is configured',
    );
  }
}
