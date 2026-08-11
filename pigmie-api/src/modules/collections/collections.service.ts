import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCollectionDto, QueryCollectionDto } from './dto/collection.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CollectionsService {
  constructor(
    private tenantPrisma: TenantPrismaService,
    private prisma: PrismaService,
  ) {}

  async getDueToday(organizationId: string, agentId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const today = new Date().toISOString().split('T')[0];
      const loans = await tx.loan.findMany({
        where: {
          organizationId,
          status: 'active',
          assignedAgentId: agentId,
          schedule: {
            some: {
              dueDate: { lte: new Date(today) },
              status: { in: ['pending', 'partially_paid', 'overdue'] },
            },
          },
        },
        include: {
          customer: { select: { id: true, fullName: true, phone: true, address: true } },
          schedule: {
            where: {
              dueDate: { lte: new Date(today) },
              status: { in: ['pending', 'partially_paid', 'overdue'] },
            },
            orderBy: { installmentNumber: 'asc' },
          },
        },
      });

      return loans.map((loan) => ({
        loanId: loan.id,
        loanCode: loan.loanCode,
        customer: loan.customer,
        installmentAmount: loan.installmentAmount,
        dueItems: loan.schedule.map((s) => ({
          scheduleId: s.id,
          installmentNumber: s.installmentNumber,
          dueDate: s.dueDate,
          dueAmount: s.dueAmount,
          paidAmount: s.paidAmount,
          remaining: new Prisma.Decimal(s.dueAmount.toString()).minus(s.paidAmount.toString()),
          status: s.status,
        })),
      }));
    });
  }

  async recordCollection(organizationId: string, staffId: string, dto: CreateCollectionDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      // Check idempotency — if this clientGeneratedId already exists, return existing
      const existing = await tx.collection.findUnique({
        where: { clientGeneratedId: dto.clientGeneratedId },
      });
      if (existing) {
        return { status: 'duplicate', collection: existing };
      }

      // Validate loan exists and is active
      const loan = await tx.loan.findFirst({
        where: { id: dto.loanId, organizationId, status: 'active' },
        include: { customer: { select: { id: true } } },
      });
      if (!loan) {
        throw new BadRequestException('Loan not found or not in active status');
      }

      // Generate receipt number
      const countToday = await tx.collection.count({
        where: {
          organizationId,
          collectionDate: new Date(dto.collectionDate),
        },
      });
      const receiptNumber = `RCP-${dto.collectionDate.replace(/-/g, '')}-${String(countToday + 1).padStart(4, '0')}`;

      // Create the collection record
      const collection = await tx.collection.create({
        data: {
          clientGeneratedId: dto.clientGeneratedId,
          organizationId,
          loanId: dto.loanId,
          customerId: loan.customer.id,
          collectedById: staffId,
          amount: dto.amount,
          collectionDate: new Date(dto.collectionDate),
          collectedAt: new Date(dto.collectedAt),
          collectionMethod: dto.collectionMethod as any,
          receiptNumber,
          latitude: dto.latitude,
          longitude: dto.longitude,
          notes: dto.notes,
          status: 'recorded',
        },
      });

      // Apply collection to schedule — oldest-due-first
      await this.applyToSchedule(tx, dto.loanId, dto.amount);

      return { status: 'created', collection };
    });
  }

  async syncCollections(
    organizationId: string,
    staffId: string,
    collections: CreateCollectionDto[],
  ) {
    const results: Array<{ clientGeneratedId: string; status: string; error?: string }> = [];

    for (const dto of collections) {
      try {
        const result = await this.recordCollection(organizationId, staffId, dto);
        results.push({ clientGeneratedId: dto.clientGeneratedId, status: result.status });
      } catch (error) {
        results.push({
          clientGeneratedId: dto.clientGeneratedId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { results };
  }

  async reverseCollection(organizationId: string, collectionId: string, staffId: string, reason: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const collection = await tx.collection.findFirst({
        where: { id: collectionId, organizationId, status: 'recorded' },
      });
      if (!collection) {
        throw new NotFoundException('Collection not found or already reversed');
      }

      const updated = await tx.collection.update({
        where: { id: collectionId },
        data: {
          status: 'reversed',
          reversedReason: reason,
          reversedById: staffId,
          reversedAt: new Date(),
        },
      });

      // Recalculate schedule after reversal — the sync_loan_totals trigger handles loan totals
      // but we need to undo the schedule allocation
      await this.reverseScheduleAllocation(tx, collection.loanId, Number(collection.amount));

      return updated;
    });
  }

  async findAll(organizationId: string, query: QueryCollectionDto) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where: any = { organizationId };
      if (query.loanId) where.loanId = query.loanId;
      if (query.agentId) where.collectedById = query.agentId;
      if (query.dateFrom || query.dateTo) {
        where.collectionDate = {};
        if (query.dateFrom) where.collectionDate.gte = new Date(query.dateFrom);
        if (query.dateTo) where.collectionDate.lte = new Date(query.dateTo);
      }

      const [data, total] = await Promise.all([
        tx.collection.findMany({
          where,
          skip,
          take: limit,
          orderBy: { collectedAt: 'desc' },
          include: {
            customer: { select: { id: true, fullName: true } },
            loan: { select: { id: true, loanCode: true } },
            collectedBy: { select: { id: true, fullName: true } },
          },
        }),
        tx.collection.count({ where }),
      ]);

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  private async applyToSchedule(tx: any, loanId: string, amount: number) {
    let remaining = amount;

    // Phase 1: Apply to pending/partially_paid/overdue rows, oldest first
    const rows = await tx.loanSchedule.findMany({
      where: {
        loanId,
        status: { in: ['pending', 'partially_paid', 'overdue'] },
      },
      orderBy: { installmentNumber: 'asc' },
    });

    for (const row of rows) {
      if (remaining <= 0) break;
      const owedOnRow = Number(row.dueAmount) - Number(row.paidAmount);
      const applied = Math.min(remaining, owedOnRow);
      const newPaid = Number(row.paidAmount) + applied;
      remaining -= applied;

      await tx.loanSchedule.update({
        where: { id: row.id },
        data: {
          paidAmount: newPaid,
          status: newPaid >= Number(row.dueAmount) ? 'paid' : 'partially_paid',
        },
      });
    }

    // Phase 2: If still remaining, credit forward to future pending rows
    if (remaining > 0) {
      const futureRows = await tx.loanSchedule.findMany({
        where: {
          loanId,
          status: 'pending',
          dueDate: { gt: new Date() },
        },
        orderBy: { installmentNumber: 'asc' },
      });

      for (const row of futureRows) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, Number(row.dueAmount));
        remaining -= applied;

        await tx.loanSchedule.update({
          where: { id: row.id },
          data: {
            paidAmount: applied,
            status: applied >= Number(row.dueAmount) ? 'paid' : 'partially_paid',
          },
        });
      }
    }

    // Check if loan is fully paid — auto-close
    if (remaining >= 0) {
      const unpaid = await tx.loanSchedule.count({
        where: { loanId, status: { not: 'paid' } },
      });
      if (unpaid === 0) {
        await tx.loan.update({
          where: { id: loanId },
          data: { status: 'closed', closedAt: new Date() },
        });
      }
    }
  }

  private async reverseScheduleAllocation(tx: any, loanId: string, amount: number) {
    // Reverse from newest-paid first
    let remaining = amount;
    const paidRows = await tx.loanSchedule.findMany({
      where: { loanId, status: { in: ['paid', 'partially_paid'] } },
      orderBy: { installmentNumber: 'desc' },
    });

    for (const row of paidRows) {
      if (remaining <= 0) break;
      const canReverse = Math.min(remaining, Number(row.paidAmount));
      const newPaid = Number(row.paidAmount) - canReverse;
      remaining -= canReverse;

      await tx.loanSchedule.update({
        where: { id: row.id },
        data: {
          paidAmount: newPaid,
          status: newPaid <= 0 ? 'pending' : 'partially_paid',
        },
      });
    }

    // Reopen the loan if it was auto-closed
    await tx.loan.updateMany({
      where: { id: loanId, status: 'closed' },
      data: { status: 'active', closedAt: null },
    });
  }
}
