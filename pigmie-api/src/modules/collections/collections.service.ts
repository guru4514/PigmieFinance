import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateCollectionDto, QueryCollectionDto } from './dto/collection.dto';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import type { AuthenticatedUser } from '../../common/types/request-user.type';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private tenantPrisma: TenantPrismaService,
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async getDueToday(
    organizationId: string,
    user: AuthenticatedUser,
    date?: string,
  ) {
    if (
      user.type !== 'staff' ||
      user.organizationId !== organizationId ||
      (user.role === 'branch_manager' && !user.branchId)
    )
      throw new ForbiddenException('Scoped staff access is required');
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const targetDate =
        date ||
        (() => {
          // Use IST date string
          const istOffset = 5.5 * 60 * 60 * 1000;
          return new Date(Date.now() + istOffset).toISOString().split('T')[0];
        })();
      // For @db.Date columns, Prisma uses midnight UTC internally
      const todayDate = new Date(targetDate + 'T00:00:00.000Z');

      // Build loan filter
      const loanWhere: Prisma.LoanWhereInput = {
        organizationId,
        status: { in: ['active', 'defaulted'] },
      };
      if (user.role === 'agent') {
        loanWhere.assignedAgentId = user.id;
      } else if (user.role === 'branch_manager' && user.branchId) {
        loanWhere.customer = { branchId: user.branchId };
      }

      // Find all active loans that have ANY schedule due on or before target date
      const loans = await tx.loan.findMany({
        where: {
          ...loanWhere,
          schedule: {
            some: {
              dueDate: { lte: todayDate },
              status: { in: ['pending', 'partially_paid', 'overdue'] },
            },
          },
        },
        include: {
          customer: {
            select: { id: true, fullName: true, phone: true, address: true },
          },
          schedule: {
            where: {
              dueDate: { lte: todayDate },
              status: { in: ['pending', 'partially_paid', 'overdue'] },
            },
            orderBy: { installmentNumber: 'asc' },
          },
          // Get collections made specifically on the target date
          collections: {
            where: {
              collectionDate: todayDate, // Exact date match for @db.Date
              status: { in: ['recorded', 'verified'] },
            },
          },
        },
      });

      return loans.map((loan) => {
        // Today's expected installment (only schedule items due exactly today)
        const todayItems = loan.schedule.filter((s) => {
          const dueStr = new Date(s.dueDate).toISOString().split('T')[0];
          return dueStr === targetDate;
        });
        const overdueItems = loan.schedule.filter((s) => {
          const dueStr = new Date(s.dueDate).toISOString().split('T')[0];
          return dueStr < targetDate;
        });

        // Amount expected today (just today's installments)
        const todayExpected = todayItems.reduce(
          (sum, s) =>
            sum +
            new Prisma.Decimal(s.dueAmount.toString())
              .minus(s.paidAmount.toString())
              .toNumber(),
          0,
        );

        // Total overdue from past days (separate from today's expected)
        const overdueAmount = overdueItems.reduce(
          (sum, s) =>
            sum +
            new Prisma.Decimal(s.dueAmount.toString())
              .minus(s.paidAmount.toString())
              .toNumber(),
          0,
        );

        // Amount actually collected TODAY for this loan
        const collectedToday = loan.collections.reduce(
          (sum, c) => sum + c.amount.toNumber(),
          0,
        );

        // Visited = any collection was made today
        const visitedToday = loan.collections.length > 0;

        return {
          loanId: loan.id,
          loanCode: loan.loanCode,
          customer: loan.customer,
          installmentAmount: loan.installmentAmount,
          // Today's expected amount
          todayExpected: Math.round(todayExpected * 100) / 100,
          // Overdue from past days
          overdueAmount: Math.round(overdueAmount * 100) / 100,
          // Total remaining (today + overdue)
          totalRemaining:
            Math.round((todayExpected + overdueAmount) * 100) / 100,
          // Amount collected on this specific day
          collectedToday: Math.round(collectedToday * 100) / 100,
          // Whether the agent visited (collected anything) today
          visitedToday,
          // Schedule detail items
          dueItems: loan.schedule.map((s) => ({
            scheduleId: s.id,
            installmentNumber: s.installmentNumber,
            dueDate: s.dueDate,
            dueAmount: s.dueAmount,
            paidAmount: s.paidAmount,
            remaining: new Prisma.Decimal(s.dueAmount.toString()).minus(
              s.paidAmount.toString(),
            ),
            status: s.status,
          })),
        };
      });
    });
  }

  async recordCollection(
    organizationId: string,
    staffId: string,
    dto: CreateCollectionDto,
  ) {
    if (
      !Number.isFinite(dto.amount) ||
      dto.amount <= 0 ||
      dto.amount > 9999999999.99 ||
      !new Prisma.Decimal(dto.amount).equals(
        new Prisma.Decimal(dto.amount).toDecimalPlaces(2),
      )
    ) {
      throw new BadRequestException(
        'Payment must be positive with at most two decimal places',
      );
    }
    const result = await this.tenantPrisma.run(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM staff WHERE id = ${staffId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const actor = await tx.staff.findFirst({
        where: { id: staffId, organizationId, isActive: true },
      });
      if (
        !actor ||
        !['org_admin', 'branch_manager', 'agent'].includes(actor.role) ||
        (actor.role === 'branch_manager' && !actor.branchId)
      )
        throw new ForbiddenException('Payment recording is not permitted');
      await tx.$executeRaw`SELECT c.id FROM customers c JOIN loans l ON l.customer_id = c.id WHERE l.id = ${dto.loanId}::uuid AND l.organization_id = ${organizationId}::uuid AND c.organization_id = ${organizationId}::uuid FOR SHARE OF c`;
      await tx.$executeRaw`SELECT 1 FROM loans WHERE id = ${dto.loanId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const existing = await tx.collection.findFirst({
        where: {
          clientGeneratedId: dto.clientGeneratedId,
          organizationId,
          collectedById: staffId,
        },
      });
      if (existing) {
        if (
          existing.loanId !== dto.loanId ||
          !existing.amount.equals(dto.amount) ||
          existing.collectionDate.toISOString().slice(0, 10) !==
            dto.collectionDate ||
          existing.collectionMethod !== dto.collectionMethod
        ) {
          throw new ConflictException(
            'Payment identifier was already used with different details',
          );
        }
        return { status: 'duplicate', collection: existing, customer: null };
      }
      if (dto.photoUrl)
        throw new BadRequestException(
          'Attach collection evidence through private documents after payment confirmation',
        );
      const loan = await tx.loan.findFirst({
        where: {
          id: dto.loanId,
          organizationId,
          status: { in: ['active', 'defaulted'] },
          ...(actor.role === 'agent' ? { assignedAgentId: actor.id } : {}),
          ...(actor.role === 'branch_manager'
            ? { customer: { branchId: actor.branchId } }
            : {}),
        },
        include: {
          customer: { select: { id: true, email: true, fullName: true } },
        },
      });
      if (!loan)
        throw new NotFoundException('Loan not found or not active/defaulted');
      const clientId = dto.clientGeneratedId.toUpperCase();
      const receiptNumber = `RCP-${dto.collectionDate.replace(/-/g, '')}-${clientId}`;
      // A foreign/mismatched unique identifier fails closed; never query inside an aborted PostgreSQL transaction.
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
          collectionMethod: dto.collectionMethod,
          receiptNumber,
          latitude: dto.latitude,
          longitude: dto.longitude,
          photoUrl: dto.photoUrl,
          notes: dto.notes,
          status: 'recorded',
        },
      });
      await this.applyToSchedule(tx, dto.loanId, dto.amount);
      await tx.auditLog.create({
        data: {
          organizationId,
          actorStaffId: staffId,
          action: 'collection.recorded',
          entityType: 'Collection',
          entityId: collection.id,
          newValue: {
            loanId: dto.loanId,
            clientGeneratedId: dto.clientGeneratedId,
            amount: new Prisma.Decimal(dto.amount).toFixed(2),
            collectionDate: dto.collectionDate,
            collectionMethod: dto.collectionMethod,
          },
        },
      });
      return { status: 'created', collection, customer: loan.customer };
    });
    // Deliver only after commit; a mail outage cannot roll back a saved payment.
    if (result.customer?.email && result.collection.receiptNumber) {
      try {
        await this.emailService.sendPaymentConfirmation(
          result.customer.email,
          dto.amount.toString(),
          result.collection.receiptNumber,
          result.customer.fullName,
        );
      } catch {
        this.logger.warn('Payment confirmation email failed');
      }
    }
    return { status: result.status, collection: result.collection };
  }

  async syncCollections(
    organizationId: string,
    staffId: string,
    collections: CreateCollectionDto[],
  ) {
    const results: Array<{
      clientGeneratedId: string;
      status: string;
      error?: string;
    }> = [];

    for (const dto of collections) {
      try {
        const result = await this.recordCollection(
          organizationId,
          staffId,
          dto,
        );
        results.push({
          clientGeneratedId: dto.clientGeneratedId,
          status: result.status,
        });
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

  async reverseCollection(
    organizationId: string,
    collectionId: string,
    staffId: string,
    reason: string,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM staff WHERE id = ${staffId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const actor = await tx.staff.findFirst({
        where: { id: staffId, organizationId, isActive: true },
      });
      if (
        !actor ||
        !['org_admin', 'branch_manager'].includes(actor.role) ||
        (actor.role === 'branch_manager' && !actor.branchId)
      )
        throw new ForbiddenException('Payment reversal is not permitted');
      const candidate = await tx.collection.findFirst({
        where: {
          id: collectionId,
          organizationId,
          ...(actor.role === 'branch_manager'
            ? { customer: { branchId: actor.branchId } }
            : {}),
        },
        select: { loanId: true },
      });
      if (!candidate) throw new NotFoundException('Collection not found');
      await tx.$executeRaw`SELECT c.id FROM customers c JOIN loans l ON l.customer_id = c.id WHERE l.id = ${candidate.loanId}::uuid AND l.organization_id = ${organizationId}::uuid AND c.organization_id = ${organizationId}::uuid FOR SHARE OF c`;
      await tx.$executeRaw`SELECT 1 FROM loans WHERE id = ${candidate.loanId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const collection = await tx.collection.findFirst({
        where: {
          id: collectionId,
          organizationId,
          status: 'recorded',
          ...(actor.role === 'branch_manager'
            ? { customer: { branchId: actor.branchId } }
            : {}),
        },
      });
      if (!collection) {
        throw new NotFoundException('Collection not found or already reversed');
      }
      if (collection.notes === 'Pre-closure payment') {
        throw new BadRequestException(
          'Early-closure payments require a settlement adjustment, not a regular reversal',
        );
      }
      if (
        await tx.loanSchedule.count({
          where: { loanId: collection.loanId, status: 'waived' },
        })
      ) {
        throw new BadRequestException(
          'This loan requires settlement reconciliation before reversing a payment',
        );
      }

      const updated = await tx.collection.update({
        where: { id: collectionId, organizationId, status: 'recorded' },
        data: {
          status: 'reversed',
          reversedReason: reason,
          reversedById: staffId,
          reversedAt: new Date(),
        },
      });

      // Recalculate schedule after reversal — the sync_loan_totals trigger handles loan totals
      // but we need to undo the schedule allocation
      await this.reverseScheduleAllocation(
        tx,
        collection.loanId,
        Number(collection.amount),
      );
      await tx.auditLog.create({
        data: {
          organizationId,
          actorStaffId: staffId,
          action: 'collection.reversed',
          entityType: 'Collection',
          entityId: collectionId,
          oldValue: { status: 'recorded' },
          newValue: {
            status: 'reversed',
            loanId: collection.loanId,
            amount: collection.amount.toFixed(2),
            collectionDate: collection.collectionDate
              .toISOString()
              .slice(0, 10),
            collectionMethod: collection.collectionMethod,
            reasonProvided: !!reason.trim(),
          },
        },
      });

      return updated;
    });
  }

  async findAll(
    organizationId: string,
    query: QueryCollectionDto,
    user: AuthenticatedUser,
  ) {
    if (
      user.type !== 'staff' ||
      user.organizationId !== organizationId ||
      (user.role === 'branch_manager' && !user.branchId)
    )
      throw new ForbiddenException('Scoped staff access is required');
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where: Prisma.CollectionWhereInput = { organizationId };
      if (query.loanId) where.loanId = query.loanId;

      if (user.role === 'agent') {
        where.collectedById = user.id;
      } else if (user.role === 'branch_manager' && user.branchId) {
        where.customer = { branchId: user.branchId };
        if (query.agentId) where.collectedById = query.agentId;
      } else if (query.agentId) {
        where.collectedById = query.agentId;
      }

      if (query.dateFrom || query.dateTo) {
        where.collectionDate = {
          ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
          ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
        };
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

  async generateReceipt(
    organizationId: string,
    collectionId: string,
  ): Promise<Buffer> {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const collection = await tx.collection.findFirst({
        where: { id: collectionId, organizationId },
        include: {
          customer: true,
          loan: true,
          collectedBy: true,
        },
      });

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }

      return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fontSize(20).text('Receipt', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Organization ID: ${organizationId}`);
        doc.text(`Receipt ID (Collection ID): ${collection.id}`);
        doc.text(`Date and Time: ${collection.collectedAt.toISOString()}`);
        doc.text(`Customer Name: ${collection.customer.fullName}`);
        doc.text(`Amount Collected: ${collection.amount.toString()}`);
        doc.text(`Agent Name: ${collection.collectedBy.fullName}`);

        doc.end();
      });
    });
  }

  private async applyToSchedule(
    tx: Prisma.TransactionClient,
    loanId: string,
    amount: number,
  ) {
    await tx.$executeRaw`SELECT 1 FROM loan_schedule WHERE loan_id = ${loanId}::uuid FOR UPDATE`;
    let remaining = new Prisma.Decimal(amount.toString());

    // Phase 1: Apply to pending/partially_paid/overdue rows, oldest first
    const rows = await tx.loanSchedule.findMany({
      where: {
        loanId,
        status: { in: ['pending', 'partially_paid', 'overdue'] },
      },
      orderBy: { installmentNumber: 'asc' },
    });

    for (const row of rows) {
      if (remaining.lte(0)) break;
      const due = new Prisma.Decimal(row.dueAmount.toString());
      const paid = new Prisma.Decimal(row.paidAmount.toString());
      const owedOnRow = due.minus(paid);
      if (owedOnRow.lt(0))
        throw new BadRequestException(
          'Schedule requires reconciliation before recording a payment',
        );

      const applied = remaining.lt(owedOnRow) ? remaining : owedOnRow;
      const newPaid = paid.plus(applied);
      remaining = remaining.minus(applied);

      await tx.loanSchedule.update({
        where: { id: row.id },
        data: {
          paidAmount: newPaid,
          status: newPaid.gte(due) ? 'paid' : 'partially_paid',
        },
      });
    }

    // The ordered query already includes future installments; any remainder is an overpayment.

    if (remaining.toNumber() > 0) {
      throw new BadRequestException(
        `Payment of ₹${amount} exceeds total outstanding. Maximum payable: ₹${amount - remaining.toNumber()}`,
      );
    }

    // Check if loan is fully paid — auto-close
    if (remaining.gte(0)) {
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

  private async reverseScheduleAllocation(
    tx: Prisma.TransactionClient,
    loanId: string,
    amount: number,
  ) {
    // Reverse from newest-paid first
    let remaining = new Prisma.Decimal(amount.toString());
    const paidRows = await tx.loanSchedule.findMany({
      where: {
        loanId,
        paidAmount: { gt: 0 },
        status: { in: ['paid', 'partially_paid', 'overdue'] },
      },
      orderBy: { installmentNumber: 'desc' },
    });

    for (const row of paidRows) {
      if (remaining.lte(0)) break;
      const paid = new Prisma.Decimal(row.paidAmount.toString());
      const canReverse = remaining.lt(paid) ? remaining : paid;
      const newPaid = paid.minus(canReverse);
      remaining = remaining.minus(canReverse);

      await tx.loanSchedule.update({
        where: { id: row.id },
        data: {
          paidAmount: newPaid,
          status: newPaid.lte(0) ? 'pending' : 'partially_paid',
        },
      });
    }

    if (remaining.gt(0))
      throw new BadRequestException(
        'Payment allocation requires reconciliation before reversal',
      );
    // Reopen the loan if it was auto-closed
    await tx.loan.updateMany({
      where: { id: loanId, status: 'closed' },
      data: { status: 'active', closedAt: null },
    });
  }
}
