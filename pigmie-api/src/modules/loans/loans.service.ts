import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { QueryLoanDto } from './dto/query-loan.dto';
import { RestructureLoanDto } from './dto/restructure-loan.dto';
import { generateSchedule } from './utils/schedule-generator.util';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class LoansService {
  constructor(
    private tenantPrisma: TenantPrismaService,
    private notificationsService: NotificationsService
  ) {}

  async create(organizationId: string, staffId: string, dto: CreateLoanDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const product = await tx.loanProduct.findFirstOrThrow({
        where: { id: dto.loanProductId, organizationId, isActive: true },
      });

      if (dto.principalAmount < product.minAmount.toNumber() || dto.principalAmount > product.maxAmount.toNumber()) {
        throw new BadRequestException(
          `Principal amount must be between ${product.minAmount} and ${product.maxAmount}`,
        );
      }
      if (dto.tenure < product.minTenure || dto.tenure > product.maxTenure) {
        throw new BadRequestException(
          `Tenure must be between ${product.minTenure} and ${product.maxTenure}`,
        );
      }

      const customer = await tx.customer.findFirstOrThrow({
        where: { id: dto.customerId, organizationId },
      });

      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const loanCode = `LN-${Date.now()}-${random}`;

      // Calculate installment and total for display (will be finalized at disburse)
      const schedulePreview = generateSchedule({
        principal: dto.principalAmount,
        interestType: product.interestType as 'flat' | 'reducing_balance',
        annualRate: product.interestRateAnnual.toNumber(),
        tenure: dto.tenure,
        frequency: product.collectionFrequency as 'daily' | 'weekly' | 'biweekly' | 'monthly',
        startDate: new Date().toISOString().split('T')[0],
      });
      const totalPayable = schedulePreview.reduce((sum, r) => sum + r.dueAmount, 0);

      return tx.loan.create({
        data: {
          organizationId,
          customerId: dto.customerId,
          loanProductId: dto.loanProductId,
          loanCode,
          status: 'pending_approval',
          principalAmount: new Prisma.Decimal(dto.principalAmount),
          tenure: dto.tenure,
          interestType: product.interestType,
          interestRateAnnual: product.interestRateAnnual,
          collectionFrequency: product.collectionFrequency,
          installmentAmount: new Prisma.Decimal(schedulePreview[0]?.dueAmount ?? 0),
          totalPayable: new Prisma.Decimal(totalPayable),
          outstandingBalance: new Prisma.Decimal(totalPayable),
          assignedAgentId: customer.assignedAgentId,
          appliedById: staffId,
          notes: dto.notes,
        },
      });
    });
  }

  async findAll(organizationId: string, user: any, query: QueryLoanDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const where: any = { organizationId };
      if (query.status) where.status = query.status;
      if (query.customerId) where.customerId = query.customerId;

      // Agents can only see their own loans
      if (user.role === 'agent') {
        where.assignedAgentId = user.id;
      } else if (user.role === 'branch_manager' && user.branchId) {
        where.customer = { branchId: user.branchId };
        if (query.agentId) {
          where.assignedAgentId = query.agentId;
        }
      } else if (query.agentId) {
        where.assignedAgentId = query.agentId;
      }

      const [data, total] = await Promise.all([
        tx.loan.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: { select: { id: true, fullName: true, phone: true } },
            loanProduct: { select: { id: true, name: true } },
          },
        }),
        tx.loan.count({ where }),
      ]);

      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    });
  }

  async findOne(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id, organizationId },
        include: {
          customer: true,
          loanProduct: true,
          schedule: { orderBy: { installmentNumber: 'asc' } },
          collections: {
            orderBy: { collectedAt: 'desc' },
            take: 10,
            include: {
              collectedBy: { select: { id: true, fullName: true } },
            },
          },
        },
      });
      if (!loan) throw new NotFoundException('Loan not found');
      return loan;
    });
  }

  async approve(organizationId: string, id: string, staffId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({ where: { id, organizationId } });
      if (loan.status !== 'pending_approval') {
        throw new BadRequestException('Loan is not pending approval');
      }
      const updatedLoan = await tx.loan.update({
        where: { id },
        data: {
          status: 'approved',
          approvedById: staffId,
          approvedAt: new Date(),
        },
      });

      await this.notificationsService.notify(
        organizationId,
        'staff',
        loan.assignedAgentId,
        'loan_approved',
        'Loan Approved',
        `Loan ${loan.loanCode} has been approved`,
        'loan',
        loan.id
      );

      return updatedLoan;
    });
  }

  async reject(organizationId: string, id: string, staffId: string, reason: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({ where: { id, organizationId } });
      if (loan.status !== 'pending_approval') {
        throw new BadRequestException('Loan is not pending approval');
      }
      return tx.loan.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectedReason: reason,
        },
      });
    });
  }

  async disburse(organizationId: string, loanId: string, startDate: string, staffId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({
        where: { id: loanId, organizationId, status: 'approved' },
        include: { loanProduct: true },
      });

      const rows = generateSchedule({
        principal: loan.principalAmount.toNumber(),
        interestType: loan.interestType as 'flat' | 'reducing_balance',
        annualRate: loan.interestRateAnnual.toNumber(),
        tenure: loan.tenure,
        frequency: loan.collectionFrequency as 'daily' | 'weekly' | 'biweekly' | 'monthly',
        startDate,
      });

      await tx.loanSchedule.createMany({
        data: rows.map((r) => ({
          loanId,
          installmentNumber: r.installmentNumber,
          dueDate: new Date(r.dueDate),
          principalComponent: new Prisma.Decimal(r.principalComponent),
          interestComponent: new Prisma.Decimal(r.interestComponent),
          dueAmount: new Prisma.Decimal(r.dueAmount),
          status: 'pending',
        })),
      });

      const totalPayable = rows.reduce((sum, r) => sum + r.dueAmount, 0);
      const updated = await tx.loan.update({
        where: { id: loanId },
        data: {
          status: 'active',
          startDate: new Date(startDate),
          disbursedAt: new Date(),
          disbursedById: staffId,
          installmentAmount: new Prisma.Decimal(rows[0].dueAmount),
          totalPayable: new Prisma.Decimal(totalPayable),
          outstandingBalance: new Prisma.Decimal(totalPayable),
          expectedEndDate: new Date(rows[rows.length - 1].dueDate),
        },
      });

      await this.notificationsService.notify(
        organizationId,
        'staff',
        loan.assignedAgentId,
        'loan_disbursed',
        'Loan Disbursed',
        `Loan ${loan.loanCode} has been disbursed`,
        'loan',
        loan.id
      );

      return { loan: updated, schedule: rows };
    });
  }

  async close(organizationId: string, id: string, staffId: string, body?: { preClosureAmount?: number }) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({ where: { id, organizationId } });
      if (loan.status !== 'active') {
        throw new BadRequestException('Loan is not active');
      }

      if (body?.preClosureAmount !== undefined) {
         const preClosureAmount = new Prisma.Decimal(body.preClosureAmount.toString());
         const today = new Date();
         const dateString = today.toISOString().split('T')[0];
         
         const countToday = await tx.collection.count({
           where: {
             organizationId,
             collectionDate: new Date(dateString),
           },
         });
         const receiptNumber = `RCP-${dateString.replace(/-/g, '')}-${String(countToday + 1).padStart(4, '0')}`;
         const clientGeneratedId = crypto.randomUUID();

         await tx.collection.create({
           data: {
             clientGeneratedId,
             organizationId,
             loanId: loan.id,
             customerId: loan.customerId,
             collectedById: staffId,
             amount: preClosureAmount,
             collectionDate: new Date(dateString),
             collectedAt: today,
             collectionMethod: 'other',
             receiptNumber,
             notes: 'Pre-closure payment',
             status: 'recorded',
           },
         });

         const newTotalCollected = loan.totalCollected.plus(preClosureAmount);

         await tx.loanSchedule.updateMany({
           where: { loanId: loan.id, status: { in: ['pending', 'overdue'] } },
           data: { status: 'waived' }
         });

         // Mark as closed and zero out outstanding balance
         return tx.loan.update({
           where: { id },
           data: { 
             outstandingBalance: 0, 
             totalCollected: newTotalCollected,
             status: 'closed', 
             closedAt: today, 
             notes: `${loan.notes ? loan.notes + '\n' : ''}Pre-closed with amount ${body.preClosureAmount}` 
           }
         });
      }

      if (loan.outstandingBalance && loan.outstandingBalance.toNumber() > 0) {
        throw new BadRequestException('Cannot close loan with outstanding balance');
      }
      return tx.loan.update({
        where: { id },
        data: { status: 'closed', closedAt: new Date() },
      });
    });
  }

  async getPreClosureDetails(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({
        where: { id, organizationId },
        include: { schedule: { orderBy: { installmentNumber: 'asc' } }, loanProduct: true }
      });

      if (loan.status !== 'active') {
        throw new BadRequestException('Loan must be active to calculate pre-closure');
      }

      const pendingSchedule = loan.schedule.filter(s => s.status === 'pending' || s.status === 'overdue');
      const outstandingPrincipal = pendingSchedule.reduce((sum, s) => sum + s.principalComponent.toNumber(), 0);
      
      const today = new Date();
      const overdueInterest = pendingSchedule.filter(s => s.dueDate < today).reduce((sum, s) => sum + s.interestComponent.toNumber(), 0);
      
      const currentPeriod = pendingSchedule.find(s => s.dueDate >= today);
      let currentPeriodInterest = 0;
      if (currentPeriod) {
        const prevPeriod = loan.schedule.find(s => s.installmentNumber === currentPeriod.installmentNumber - 1);
        const periodStart = prevPeriod ? prevPeriod.dueDate : (loan.startDate || new Date());
        const periodEnd = currentPeriod.dueDate;
        
        const daysInPeriod = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / (1000 * 3600 * 24));
        const daysElapsed = Math.max(0, (today.getTime() - periodStart.getTime()) / (1000 * 3600 * 24));
        
        currentPeriodInterest = (currentPeriod.interestComponent.toNumber() * daysElapsed) / daysInPeriod;
      }
      
      const accruedInterest = overdueInterest + currentPeriodInterest;

      // Make configurable via loan product (fallback to 2)
      const penaltyRate = (loan.loanProduct as any).preClosurePenaltyRate ?? 2;
      const preClosurePenalty = (outstandingPrincipal * penaltyRate) / 100;
      
      const preClosureAmount = outstandingPrincipal + accruedInterest + preClosurePenalty;
      const remainingScheduledPayments = pendingSchedule.reduce((sum, s) => sum + s.dueAmount.toNumber(), 0);
      const amountSaved = remainingScheduledPayments - preClosureAmount;

      return {
        outstandingPrincipal,
        accruedInterest,
        preClosurePenalty,
        preClosureAmount,
        amountSaved,
        penaltyRate
      };
    });
  }

  async writeOff(organizationId: string, id: string, reason: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({ where: { id, organizationId } });
      if (loan.status !== 'active' && loan.status !== 'defaulted') {
        throw new BadRequestException('Can only write-off active or defaulted loans');
      }
      return tx.loan.update({
        where: { id },
        data: {
          status: 'written_off',
          closedAt: new Date(),
          notes: reason,
        },
      });
    });
  }

  async markDefault(organizationId: string, id: string, staffId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({ where: { id, organizationId } });
      if (loan.status !== 'active') {
        throw new BadRequestException('Only active loans can be marked as default');
      }
      return tx.loan.update({
        where: { id },
        data: { status: 'defaulted' },
      });
    });
  }

  async getSchedule(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await tx.loan.findFirstOrThrow({ where: { id, organizationId } });
      return tx.loanSchedule.findMany({
        where: { loanId: id },
        orderBy: { installmentNumber: 'asc' },
      });
    });
  }

  async restructure(organizationId: string, id: string, staffId: string, dto: RestructureLoanDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({
        where: { id, organizationId },
      });

      if (loan.status !== 'active') {
        throw new BadRequestException('Can only restructure active loans');
      }

      const targetRow = await tx.loanSchedule.findFirst({
        where: { loanId: id, installmentNumber: dto.fromInstallmentNumber }
      });

      if (!targetRow) {
        throw new BadRequestException('Invalid installment number');
      }

      if (targetRow.status === 'paid' || targetRow.status === 'partially_paid') {
        throw new BadRequestException('Cannot restructure from an already paid or partially paid installment');
      }

      const rowsToDelete = await tx.loanSchedule.findMany({
        where: {
          loanId: id,
          installmentNumber: { gte: dto.fromInstallmentNumber },
          status: { in: ['pending', 'overdue'] }
        }
      });

      if (rowsToDelete.length === 0) {
        throw new BadRequestException('No pending installments found to restructure');
      }

      const remainingPrincipal = rowsToDelete.reduce((sum, r) => sum + r.principalComponent.toNumber(), 0);
      const deletedDueAmountSum = rowsToDelete.reduce((sum, r) => sum + r.dueAmount.toNumber(), 0);

      await tx.loanSchedule.deleteMany({
        where: {
          loanId: id,
          installmentNumber: { gte: dto.fromInstallmentNumber },
          status: { in: ['pending', 'overdue'] }
        }
      });

      let prevDueDate = loan.startDate;
      if (dto.fromInstallmentNumber > 1) {
        const prevRow = await tx.loanSchedule.findFirst({
          where: { loanId: id, installmentNumber: dto.fromInstallmentNumber - 1 }
        });
        if (prevRow) {
          prevDueDate = prevRow.dueDate;
        }
      }
      const startDateStr = prevDueDate ? prevDueDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      const newRows = generateSchedule({
        principal: remainingPrincipal,
        interestType: loan.interestType as 'flat' | 'reducing_balance',
        annualRate: loan.interestRateAnnual.toNumber(),
        tenure: dto.newTenure,
        frequency: loan.collectionFrequency as 'daily' | 'weekly' | 'biweekly' | 'monthly',
        startDate: startDateStr,
      });

      const scheduleData = newRows.map((r, i) => ({
        loanId: id,
        installmentNumber: dto.fromInstallmentNumber + i,
        dueDate: new Date(r.dueDate),
        principalComponent: new Prisma.Decimal(r.principalComponent),
        interestComponent: new Prisma.Decimal(r.interestComponent),
        dueAmount: new Prisma.Decimal(r.dueAmount),
        status: 'pending' as const,
      }));

      await tx.loanSchedule.createMany({ data: scheduleData });

      const newDueAmountSum = newRows.reduce((sum, r) => sum + r.dueAmount, 0);
      const newTotalPayable = loan.totalPayable.toNumber() - deletedDueAmountSum + newDueAmountSum;
      const newOutstandingBalance = loan.outstandingBalance.toNumber() - deletedDueAmountSum + newDueAmountSum;
      const newExpectedEndDate = new Date(newRows[newRows.length - 1].dueDate);
      const newTenureTotal = dto.fromInstallmentNumber - 1 + dto.newTenure;

      const updated = await tx.loan.update({
        where: { id },
        data: {
          tenure: newTenureTotal,
          totalPayable: new Prisma.Decimal(newTotalPayable),
          outstandingBalance: new Prisma.Decimal(newOutstandingBalance),
          expectedEndDate: newExpectedEndDate,
          notes: dto.reason ? `${loan.notes ? loan.notes + '\n' : ''}Restructured: ${dto.reason}` : loan.notes,
        }
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorStaffId: staffId,
          action: 'loan.restructured',
          entityType: 'loan',
          entityId: id,
          newValue: {
            fromInstallmentNumber: dto.fromInstallmentNumber,
            newTenure: dto.newTenure,
            reason: dto.reason,
            remainingPrincipal,
            newTotalPayable
          }
        }
      });

      return { loan: updated, newSchedule: scheduleData };
    });
  }
}
