import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { QueryLoanDto } from './dto/query-loan.dto';
import { generateSchedule } from './utils/schedule-generator.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class LoansService {
  constructor(private tenantPrisma: TenantPrismaService) {}

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
      return tx.loan.update({
        where: { id },
        data: {
          status: 'approved',
          approvedById: staffId,
          approvedAt: new Date(),
        },
      });
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

      return { loan: updated, schedule: rows };
    });
  }

  async close(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const loan = await tx.loan.findFirstOrThrow({ where: { id, organizationId } });
      if (loan.status !== 'active') {
        throw new BadRequestException('Loan is not active');
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

  async getSchedule(organizationId: string, id: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await tx.loan.findFirstOrThrow({ where: { id, organizationId } });
      return tx.loanSchedule.findMany({
        where: { loanId: id },
        orderBy: { installmentNumber: 'asc' },
      });
    });
  }
}
