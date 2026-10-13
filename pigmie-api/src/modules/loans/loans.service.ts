import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { QueryLoanDto } from './dto/query-loan.dto';
import { RestructureLoanDto } from './dto/restructure-loan.dto';
import { generateSchedule } from './utils/schedule-generator.util';
import { calculatePreClosure } from './utils/pre-closure.util';
import { assertScheduleMatchesFinancialTerms } from './utils/financial-terms.util';
import { assertLoanMatchesOriginalTerms } from './utils/original-terms.util';
import { businessDate } from './utils/date.util';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import type { StaffRole } from '../../common/types/request-user.type';
import type { AuthenticatedUser } from '../../common/types/request-user.type';

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    private tenantPrisma: TenantPrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

  async create(organizationId: string, staffId: string, dto: CreateLoanDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const actor = await this.lockActor(tx, organizationId, staffId, [
        'org_admin',
        'branch_manager',
        'agent',
      ]);
      await tx.$executeRaw`SELECT 1 FROM customers WHERE id = ${dto.customerId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      await tx.$executeRaw`SELECT 1 FROM loan_products WHERE id = ${dto.loanProductId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const product = await tx.loanProduct.findFirstOrThrow({
        where: { id: dto.loanProductId, organizationId, isActive: true },
      });
      if (!product.processingFee.isZero() || !product.lateFeeValue.isZero()) {
        throw new BadRequestException(
          'This product has unsupported fees. Use a product with zero fees until versioned loan terms and fee accounting are implemented.',
        );
      }

      if (
        dto.principalAmount < product.minAmount.toNumber() ||
        dto.principalAmount > product.maxAmount.toNumber()
      ) {
        throw new BadRequestException(
          `Principal amount must be between ${product.minAmount.toString()} and ${product.maxAmount.toString()}`,
        );
      }
      if (dto.tenure < product.minTenure || dto.tenure > product.maxTenure) {
        throw new BadRequestException(
          `Tenure must be between ${product.minTenure} and ${product.maxTenure}`,
        );
      }

      const customer = await tx.customer.findFirstOrThrow({
        where: {
          id: dto.customerId,
          organizationId,
          ...(actor.role === 'agent' ? { assignedAgentId: actor.id } : {}),
          ...(actor.role === 'branch_manager'
            ? { branchId: actor.branchId }
            : {}),
        },
      });

      const random = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
      const loanCode = `LN-${Date.now()}-${random}`;

      // Calculate installment and total for display (will be finalized at disburse)
      const schedulePreview = generateSchedule({
        principal: dto.principalAmount,
        interestType: product.interestType,
        annualRate: product.interestRateAnnual.toNumber(),
        tenure: dto.tenure,
        frequency: product.collectionFrequency,
        startDate: new Date().toISOString().split('T')[0],
      });
      const totalPayable = schedulePreview.reduce(
        (sum, r) => sum.plus(r.dueAmount),
        new Prisma.Decimal(0),
      );

      return tx.loan.create({
        data: {
          organizationId,
          customerId: dto.customerId,
          loanProductId: dto.loanProductId,
          loanCode,
          status: 'pending_approval',
          principalAmount: new Prisma.Decimal(dto.principalAmount),
          financialTerms: {
            version: 1,
            currency: 'INR',
            businessTimezone: 'Asia/Kolkata',
            originalPrincipal: new Prisma.Decimal(dto.principalAmount).toFixed(
              2,
            ),
            originalTenure: dto.tenure,
            interestType: product.interestType,
            interestRateAnnual: product.interestRateAnnual.toString(),
            collectionFrequency: product.collectionFrequency,
            paymentAllocation: 'oldest_installment_proportional_components_v1',
            earlyClosure: 'unpaid_principal_daily_accrued_interest_v1',
            lateFee: '0.00',
            processingFee: '0.00',
            preClosurePenalty: '0.00',
            rounding: 'INR_two_decimal_half_up',
          },
          tenure: dto.tenure,
          interestType: product.interestType,
          interestRateAnnual: product.interestRateAnnual,
          collectionFrequency: product.collectionFrequency,
          installmentAmount: new Prisma.Decimal(
            schedulePreview[0]?.dueAmount ?? 0,
          ),
          totalPayable: new Prisma.Decimal(totalPayable),
          outstandingBalance: new Prisma.Decimal(totalPayable),
          assignedAgentId: customer.assignedAgentId,
          appliedById: staffId,
          notes: dto.notes,
        },
      });
    });
  }

  async findAll(
    organizationId: string,
    user: AuthenticatedUser,
    query: QueryLoanDto,
  ) {
    if (
      user.type !== 'staff' ||
      user.organizationId !== organizationId ||
      (user.role === 'branch_manager' && !user.branchId)
    )
      throw new ForbiddenException('Scoped staff access is required');
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const where: Prisma.LoanWhereInput = { organizationId };
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

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
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
      const where = await this.lockLoanScope(tx, organizationId, id, staffId);
      const loan = await tx.loan.findFirstOrThrow({
        where,
        include: { customer: true },
      });
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

      if (loan.assignedAgentId) {
        await this.notificationsService.notify(
          organizationId,
          'staff',
          loan.assignedAgentId,
          'loan_approved',
          'Loan Approved',
          `Loan ${loan.loanCode} has been approved`,
          'loan',
          loan.id,
        );
      }

      try {
        if (loan.customer.email) {
          await this.emailService.sendLoanApproved(
            loan.customer.email,
            loan.loanCode,
            loan.customer.fullName,
          );
        }
      } catch {
        this.logger.warn('Email send failed');
      }

      return updatedLoan;
    });
  }

  async reject(
    organizationId: string,
    id: string,
    staffId: string,
    reason: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where = await this.lockLoanScope(tx, organizationId, id, staffId);
      const loan = await tx.loan.findFirstOrThrow({
        where,
      });
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

  async disburse(
    organizationId: string,
    loanId: string,
    startDate: string,
    staffId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where = await this.lockLoanScope(
        tx,
        organizationId,
        loanId,
        staffId,
      );
      const loan = await tx.loan.findFirstOrThrow({
        where: { ...where, status: 'approved' },
        include: { loanProduct: true, customer: true },
      });
      assertLoanMatchesOriginalTerms(loan, true);

      const rows = generateSchedule({
        principal: loan.principalAmount.toNumber(),
        interestType: loan.interestType,
        annualRate: loan.interestRateAnnual.toNumber(),
        tenure: loan.tenure,
        frequency: loan.collectionFrequency,
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
          paidPrincipal: new Prisma.Decimal(0),
          paidInterest: new Prisma.Decimal(0),
          paidFees: new Prisma.Decimal(0),
          status: 'pending',
        })),
      });

      const totalPayable = rows.reduce(
        (sum, r) => sum.plus(r.dueAmount),
        new Prisma.Decimal(0),
      );
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

      if (loan.assignedAgentId) {
        await this.notificationsService.notify(
          organizationId,
          'staff',
          loan.assignedAgentId,
          'loan_disbursed',
          'Loan Disbursed',
          `Loan ${loan.loanCode} has been disbursed`,
          'loan',
          loan.id,
        );
      }

      try {
        if (loan.customer.email) {
          await this.emailService.sendLoanDisbursed(
            loan.customer.email,
            loan.loanCode,
            loan.principalAmount.toString(),
            loan.customer.fullName,
          );
        }
      } catch {
        this.logger.warn('Email send failed');
      }

      return { loan: updated, schedule: rows };
    });
  }

  async close(
    organizationId: string,
    id: string,
    staffId: string,
    body?: { preClosureAmount?: number },
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where = await this.lockLoanScope(tx, organizationId, id, staffId);
      const loan = await tx.loan.findFirstOrThrow({
        where,
        include: { schedule: true },
      });
      if (loan.status !== 'active')
        throw new BadRequestException('Loan is not active');
      this.assertClosureBalances(loan);
      await this.assertCurrentFinancialTerms(tx, loan);
      if (body?.preClosureAmount !== undefined) {
        const amount = body.preClosureAmount;
        if (
          !Number.isFinite(amount) ||
          amount <= 0 ||
          amount > 9999999999.99 ||
          !new Prisma.Decimal(amount).equals(
            new Prisma.Decimal(amount).toDecimalPlaces(2),
          )
        ) {
          throw new BadRequestException(
            'Payoff must be a positive amount with at most two decimal places',
          );
        }
        const today = new Date();
        const quote = calculatePreClosure(loan.schedule, loan.startDate, today);
        if (!new Prisma.Decimal(amount).equals(quote.preClosureAmount)) {
          throw new BadRequestException(
            'Payoff changed. Refresh the early-closure quote before confirming',
          );
        }
        const payment = new Prisma.Decimal(amount);
        const date = businessDate(today);
        const clientGeneratedId = crypto.randomUUID();
        const receiptNumber = `RCP-${date.toISOString().slice(0, 10).replace(/-/g, '')}-${clientGeneratedId.toUpperCase()}`;
        // A settlement is recorded separately from installment allocations.
        // Waived schedule rows retain their original charges and paid amounts.
        const settlementEvidence = {
          version: 1,
          componentVersion: 1,
          type: 'early_closure',
          principal: new Prisma.Decimal(quote.outstandingPrincipal).toFixed(2),
          interest: new Prisma.Decimal(quote.accruedInterest).toFixed(2),
          fees: new Prisma.Decimal(quote.lateFees).toFixed(2),
          penalty: new Prisma.Decimal(quote.preClosurePenalty).toFixed(2),
          waivedAmount: new Prisma.Decimal(quote.amountSaved).toFixed(2),
          settledAt: today.toISOString(),
          sourceSchedule: loan.schedule.map((row) => ({
            scheduleId: row.id,
            installmentNumber: row.installmentNumber,
            dueDate: row.dueDate.toISOString().slice(0, 10),
            principal: row.principalComponent.toFixed(2),
            interest: row.interestComponent.toFixed(2),
            dueAmount: row.dueAmount.toFixed(2),
            paidAmount: row.paidAmount.toFixed(2),
            paidPrincipal: row.paidPrincipal?.toFixed(2) ?? null,
            paidInterest: row.paidInterest?.toFixed(2) ?? null,
            paidFees: row.paidFees?.toFixed(2) ?? null,
            status: row.status,
          })),
        };
        await tx.collection.create({
          data: {
            clientGeneratedId,
            organizationId,
            loanId: id,
            customerId: loan.customerId,
            collectedById: staffId,
            amount: payment,
            collectionDate: date,
            collectedAt: today,
            collectionMethod: 'other',
            receiptNumber,
            notes: 'Pre-closure payment',
            allocationDetails: settlementEvidence,
            status: 'recorded',
          },
        });
        const totalCollected = loan.totalCollected.plus(payment);
        await tx.loanSchedule.updateMany({
          where: {
            loanId: id,
            status: { in: ['pending', 'partially_paid', 'overdue'] },
          },
          data: { status: 'waived' },
        });
        const updated = await tx.loan.update({
          where: { id },
          data: {
            outstandingBalance: 0,
            totalCollected,
            totalPayable: totalCollected,
            status: 'closed',
            closedAt: today,
            notes: `${loan.notes ? loan.notes + '\n' : ''}Pre-closed with amount ${amount}`,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorStaffId: staffId,
            action: 'loan.pre_closed',
            entityType: 'Loan',
            entityId: id,
            newValue: {
              payment: payment.toString(),
              previousTotalPayable: loan.totalPayable.toString(),
              settledTotalPayable: totalCollected.toString(),
              calculation: quote,
              settlementEvidence,
            },
          },
        });
        return updated;
      }
      if (loan.outstandingBalance.gt(0))
        throw new BadRequestException(
          'Cannot close loan with outstanding balance',
        );
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
        include: { schedule: true },
      });
      if (loan.status !== 'active')
        throw new BadRequestException(
          'Loan must be active to calculate pre-closure',
        );
      this.assertClosureBalances(loan);
      await this.assertCurrentFinancialTerms(tx, loan);
      return calculatePreClosure(loan.schedule, loan.startDate);
    });
  }

  private assertClosureBalances(loan: {
    financialTerms?: Prisma.JsonValue;
    totalPayable: Prisma.Decimal;
    totalCollected: Prisma.Decimal;
    outstandingBalance: Prisma.Decimal;
    schedule: {
      dueAmount: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      principalComponent: Prisma.Decimal;
      interestComponent: Prisma.Decimal;
      status: string;
    }[];
  }) {
    assertScheduleMatchesFinancialTerms(loan.financialTerms, loan.schedule);
    const scheduledOutstanding = loan.schedule.reduce(
      (sum, row) =>
        row.status === 'waived'
          ? sum
          : sum.plus(row.dueAmount.minus(row.paidAmount)),
      new Prisma.Decimal(0),
    );
    if (
      loan.schedule.some(
        (row) =>
          row.paidAmount.lt(0) ||
          row.paidAmount.gt(row.dueAmount) ||
          row.principalComponent.lt(0) ||
          row.interestComponent.lt(0) ||
          row.dueAmount.lt(
            row.principalComponent.plus(row.interestComponent),
          ) ||
          (row.status === 'paid' && !row.paidAmount.equals(row.dueAmount)),
      ) ||
      loan.outstandingBalance.lt(0) ||
      !loan.totalPayable
        .minus(loan.totalCollected)
        .equals(loan.outstandingBalance) ||
      !scheduledOutstanding.equals(loan.outstandingBalance)
    )
      throw new BadRequestException(
        'Loan balances require reconciliation before closure',
      );
  }

  async writeOff(
    organizationId: string,
    id: string,
    reason: string,
    staffId: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where = await this.lockLoanScope(tx, organizationId, id, staffId, [
        'org_admin',
      ]);
      const loan = await tx.loan.findFirstOrThrow({
        where,
      });
      if (loan.status !== 'active' && loan.status !== 'defaulted') {
        throw new BadRequestException(
          'Can only write-off active or defaulted loans',
        );
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
      const where = await this.lockLoanScope(tx, organizationId, id, staffId);
      const loan = await tx.loan.findFirstOrThrow({
        where,
      });
      if (loan.status !== 'active') {
        throw new BadRequestException(
          'Only active loans can be marked as default',
        );
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

  async restructure(
    organizationId: string,
    id: string,
    staffId: string,
    dto: RestructureLoanDto,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where = await this.lockLoanScope(tx, organizationId, id, staffId);
      await tx.$executeRaw`SELECT 1 FROM loan_schedule WHERE loan_id = ${id}::uuid FOR UPDATE`;
      const loan = await tx.loan.findFirstOrThrow({
        where,
        include: { schedule: true },
      });

      if (loan.status !== 'active') {
        throw new BadRequestException('Can only restructure active loans');
      }
      await this.assertCurrentFinancialTerms(tx, loan);
      this.assertClosureBalances(loan);

      const targetRow = await tx.loanSchedule.findFirst({
        where: { loanId: id, installmentNumber: dto.fromInstallmentNumber },
      });

      if (!targetRow) {
        throw new BadRequestException('Invalid installment number');
      }

      if (
        targetRow.status === 'paid' ||
        targetRow.status === 'partially_paid'
      ) {
        throw new BadRequestException(
          'Cannot restructure from an already paid or partially paid installment',
        );
      }

      const rowsToDelete = await tx.loanSchedule.findMany({
        where: {
          loanId: id,
          installmentNumber: { gte: dto.fromInstallmentNumber },
        },
        orderBy: { installmentNumber: 'asc' },
      });

      if (rowsToDelete.length === 0) {
        throw new BadRequestException(
          'No pending installments found to restructure',
        );
      }
      if (
        rowsToDelete.some(
          (row) =>
            !['pending', 'overdue'].includes(row.status) ||
            row.paidAmount.gt(0) ||
            [row.paidPrincipal, row.paidInterest, row.paidFees].some(
              (component) => component !== null && !component.equals(0),
            ) ||
            row.principalComponent.lt(0) ||
            row.interestComponent.lt(0) ||
            !row.dueAmount.equals(
              row.principalComponent.plus(row.interestComponent),
            ),
        )
      ) {
        throw new BadRequestException(
          'Paid, waived or fee-bearing installments require reconciliation before restructuring',
        );
      }
      if (
        !Number.isInteger(dto.newTenure) ||
        dto.newTenure < 1 ||
        dto.fromInstallmentNumber - 1 + dto.newTenure > 10000
      ) {
        throw new BadRequestException(
          'Restructured tenure exceeds the supported installment count',
        );
      }

      const remainingPrincipal = rowsToDelete
        .reduce(
          (sum, r) => sum.plus(r.principalComponent),
          new Prisma.Decimal(0),
        )
        .toNumber();
      const deletedDueAmountSum = rowsToDelete.reduce(
        (sum, r) => sum.plus(r.dueAmount),
        new Prisma.Decimal(0),
      );

      await tx.loanSchedule.deleteMany({
        where: {
          loanId: id,
          installmentNumber: { gte: dto.fromInstallmentNumber },
          status: { in: ['pending', 'overdue'] },
        },
      });

      let prevDueDate = loan.startDate;
      if (dto.fromInstallmentNumber > 1) {
        const prevRow = await tx.loanSchedule.findFirst({
          where: {
            loanId: id,
            installmentNumber: dto.fromInstallmentNumber - 1,
          },
        });
        if (prevRow) {
          prevDueDate = prevRow.dueDate;
        }
      }
      const startDateStr = prevDueDate
        ? prevDueDate.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const newRows = generateSchedule({
        principal: remainingPrincipal,
        interestType: loan.interestType,
        annualRate: loan.interestRateAnnual.toNumber(),
        tenure: dto.newTenure,
        frequency: loan.collectionFrequency,
        startDate: startDateStr,
      });

      const scheduleData = newRows.map((r, i) => ({
        loanId: id,
        installmentNumber: dto.fromInstallmentNumber + i,
        dueDate: new Date(r.dueDate),
        principalComponent: new Prisma.Decimal(r.principalComponent),
        interestComponent: new Prisma.Decimal(r.interestComponent),
        dueAmount: new Prisma.Decimal(r.dueAmount),
        paidPrincipal: new Prisma.Decimal(0),
        paidInterest: new Prisma.Decimal(0),
        paidFees: new Prisma.Decimal(0),
        status: 'pending' as const,
      }));

      await tx.loanSchedule.createMany({ data: scheduleData });

      const newDueAmountSumDec = newRows.reduce(
        (sum, r) => sum.plus(r.dueAmount),
        new Prisma.Decimal(0),
      );
      const deletedDueAmountSumDec = deletedDueAmountSum;
      const newTotalPayable = loan.totalPayable
        .minus(deletedDueAmountSumDec)
        .plus(newDueAmountSumDec);
      const newOutstandingBalance = loan.outstandingBalance
        .minus(deletedDueAmountSumDec)
        .plus(newDueAmountSumDec);
      const newExpectedEndDate = new Date(newRows[newRows.length - 1].dueDate);
      const newTenureTotal = dto.fromInstallmentNumber - 1 + dto.newTenure;

      const updated = await tx.loan.update({
        where: { id },
        data: {
          tenure: newTenureTotal,
          totalPayable: newTotalPayable,
          outstandingBalance: newOutstandingBalance,
          expectedEndDate: newExpectedEndDate,
          notes: dto.reason
            ? `${loan.notes ? loan.notes + '\n' : ''}Restructured: ${dto.reason}`
            : loan.notes,
        },
      });

      const replacementRows = await tx.loanSchedule.findMany({
        where: {
          loanId: id,
          installmentNumber: { gte: dto.fromInstallmentNumber },
        },
        orderBy: { installmentNumber: 'asc' },
      });
      const scheduleEvidence = (rows: typeof rowsToDelete) =>
        rows.map((row) => ({
          id: row.id,
          installmentNumber: row.installmentNumber,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          principalComponent: row.principalComponent.toFixed(2),
          interestComponent: row.interestComponent.toFixed(2),
          dueAmount: row.dueAmount.toFixed(2),
          paidAmount: row.paidAmount.toFixed(2),
          paidPrincipal: row.paidPrincipal?.toFixed(2) ?? null,
          paidInterest: row.paidInterest?.toFixed(2) ?? null,
          paidFees: row.paidFees?.toFixed(2) ?? null,
          status: row.status,
        }));

      const beforeEvidence = {
        evidenceVersion: 1,
        financialTerms: loan.financialTerms ?? null,
        tenure: loan.tenure,
        totalPayable: loan.totalPayable.toFixed(2),
        outstandingBalance: loan.outstandingBalance.toFixed(2),
        replacedSchedule: scheduleEvidence(rowsToDelete),
      };
      const afterEvidence = {
        evidenceVersion: 1,
        borrowerAcceptance: 'not_recorded',
        fromInstallmentNumber: dto.fromInstallmentNumber,
        newTenure: dto.newTenure,
        reason: dto.reason ?? null,
        remainingPrincipal: new Prisma.Decimal(remainingPrincipal).toFixed(2),
        newTotalPayable: newTotalPayable.toFixed(2),
        newOutstandingBalance: newOutstandingBalance.toFixed(2),
        totalTenure: newTenureTotal,
        interestType: loan.interestType,
        interestRateAnnual: loan.interestRateAnnual.toString(),
        collectionFrequency: loan.collectionFrequency,
        replacementSchedule: scheduleEvidence(replacementRows),
      };
      // The scoped loan lock serializes allocation of recorded amendment versions.
      // A version is never inferred from old audit entries or unknown history.
      const lastAmendment = await tx.loanAmendment.findFirst({
        where: { organizationId, loanId: id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const amendment = await tx.loanAmendment.create({
        data: {
          organizationId,
          loanId: id,
          actorStaffId: staffId,
          version: (lastAmendment?.version ?? 0) + 1,
          operation: 'restructure',
          reason: dto.reason ?? null,
          beforeEvidence,
          afterEvidence,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorStaffId: staffId,
          action: 'loan.restructured',
          entityType: 'loan',
          entityId: id,
          oldValue: beforeEvidence,
          newValue: {
            ...afterEvidence,
            amendmentId: amendment.id,
            amendmentVersion: amendment.version,
          },
        },
      });
      return { loan: updated, newSchedule: scheduleData };
    });
  }

  private async assertCurrentFinancialTerms(
    tx: Prisma.TransactionClient,
    loan: Parameters<typeof assertLoanMatchesOriginalTerms>[0] & {
      id: string;
      organizationId: string;
    },
  ): Promise<void> {
    assertLoanMatchesOriginalTerms(loan);
    const terms = loan.financialTerms;
    if (
      terms === null ||
      terms === undefined ||
      typeof terms !== 'object' ||
      Array.isArray(terms)
    )
      return;
    const latest = await tx.loanAmendment.findFirst({
      where: { loanId: loan.id, organizationId: loan.organizationId },
      orderBy: { version: 'desc' },
      select: { afterEvidence: true },
    });
    if (!latest) {
      if (loan.tenure === terms.originalTenure) return;
    } else {
      const evidence = latest.afterEvidence;
      if (
        evidence !== null &&
        typeof evidence === 'object' &&
        !Array.isArray(evidence) &&
        evidence.evidenceVersion === 1 &&
        evidence.totalTenure === loan.tenure &&
        evidence.interestType === loan.interestType &&
        evidence.collectionFrequency === loan.collectionFrequency &&
        evidence.interestRateAnnual === loan.interestRateAnnual.toString()
      )
        return;
    }
    throw new BadRequestException(
      'Current loan tenure differs from its recorded contract amendment; reconciliation is required',
    );
  }

  private async lockActor(
    tx: Prisma.TransactionClient,
    organizationId: string,
    staffId: string,
    roles: StaffRole[],
  ) {
    await tx.$executeRaw`SELECT 1 FROM staff WHERE id = ${staffId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
    const actor = await tx.staff.findFirst({
      where: { id: staffId, organizationId, isActive: true },
      select: { id: true, role: true, branchId: true },
    });
    if (
      !actor ||
      !roles.includes(actor.role) ||
      (actor.role === 'branch_manager' && !actor.branchId)
    ) {
      throw new ForbiddenException('Loan mutation is not permitted');
    }
    return actor;
  }

  private async lockLoanScope(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    staffId: string,
    roles: StaffRole[] = ['org_admin', 'branch_manager'],
  ): Promise<Prisma.LoanWhereInput> {
    const actor = await this.lockActor(tx, organizationId, staffId, roles);
    await tx.$executeRaw`SELECT c.id FROM customers c JOIN loans l ON l.customer_id = c.id WHERE l.id = ${id}::uuid AND l.organization_id = ${organizationId}::uuid AND c.organization_id = ${organizationId}::uuid FOR SHARE OF c`;
    await tx.$executeRaw`SELECT 1 FROM loans WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    return {
      id,
      organizationId,
      ...(actor.role === 'branch_manager'
        ? { customer: { branchId: actor.branchId } }
        : {}),
    };
  }
}
