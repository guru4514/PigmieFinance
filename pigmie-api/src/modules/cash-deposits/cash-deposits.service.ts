import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { addPeriods } from '../loans/utils/date.util';
import { QueryCashDepositsDto } from './dto/query-cash-deposits.dto';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCashDepositDto } from './dto/create-cash-deposit.dto';
import { VerifyCashDepositDto } from './dto/verify-cash-deposit.dto';

@Injectable()
export class CashDepositsService {
  constructor(
    private tenantPrisma: TenantPrismaService,
    private prisma: PrismaService,
  ) {}

  private async actor(
    tx: Prisma.TransactionClient,
    organizationId: string,
    staffId: string,
    lock = false,
  ) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM staff WHERE id = ${staffId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
    const staff = await tx.staff.findFirst({
      where: { id: staffId, organizationId, isActive: true },
      select: { id: true, role: true, branchId: true },
    });
    if (!staff || (staff.role === 'branch_manager' && !staff.branchId))
      throw new ForbiddenException('Cash deposit scope is unavailable');
    return staff;
  }

  async create(
    organizationId: string,
    agentId: string,
    dto: CreateCashDepositDto,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const actor = await this.actor(tx, organizationId, agentId, true);
      if (!['agent', 'branch_manager', 'org_admin'].includes(actor.role))
        throw new ForbiddenException();
      if (
        !Number.isFinite(dto.amount) ||
        dto.amount <= 0 ||
        dto.amount > 9999999999.99 ||
        !new Prisma.Decimal(dto.amount).equals(
          new Prisma.Decimal(dto.amount).toDecimalPlaces(2),
        )
      )
        throw new BadRequestException('Invalid deposit amount');
      addPeriods(dto.depositDate, 0, 'daily');
      const cashDeposit = await tx.cashDeposit.create({
        data: {
          organizationId,
          agentId,
          amount: dto.amount,
          depositDate: new Date(dto.depositDate),
          notes: dto.notes,
          status: 'pending',
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorStaffId: agentId,
          action: 'cash_handover.recorded',
          entityType: 'CashDeposit',
          entityId: cashDeposit.id,
          newValue: {
            amount: new Prisma.Decimal(dto.amount).toFixed(2),
            depositDate: dto.depositDate,
            status: 'pending',
          },
        },
      });
      return cashDeposit;
    });
  }

  async findAll(
    organizationId: string,
    query: QueryCashDepositsDto,
    user: AuthenticatedUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      if (user.type !== 'staff' || user.organizationId !== organizationId)
        throw new ForbiddenException();
      const actor = await this.actor(tx, organizationId, user.id);
      const where: Prisma.CashDepositWhereInput = { organizationId };
      if (query.agentId) where.agentId = query.agentId;
      if (actor.role === 'agent') where.agentId = actor.id;
      if (actor.role === 'branch_manager')
        where.agent = { organizationId, branchId: actor.branchId };
      if (query.status) where.status = query.status;
      if (query.dateFrom || query.dateTo) {
        where.depositDate = {};
        if (query.dateFrom) where.depositDate.gte = new Date(query.dateFrom);
        if (query.dateTo) where.depositDate.lte = new Date(query.dateTo);
      }

      const data = await tx.cashDeposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: { select: { id: true, fullName: true } },
          verifiedBy: { select: { id: true, fullName: true } },
        },
      });
      return data;
    });
  }

  async verify(
    organizationId: string,
    id: string,
    verifierId: string,
    dto: VerifyCashDepositDto,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const actor = await this.actor(tx, organizationId, verifierId, true);
      if (!['org_admin', 'branch_manager'].includes(actor.role))
        throw new ForbiddenException();
      if (!['verified', 'discrepancy'].includes(dto.status))
        throw new BadRequestException('Invalid verification status');
      await tx.$queryRaw`SELECT id FROM cash_deposits WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const deposit = await tx.cashDeposit.findFirst({
        where: { id, organizationId, status: 'pending' },
      });
      if (!deposit) {
        throw new NotFoundException(
          'Cash deposit not found or already verified',
        );
      }
      await tx.$queryRaw`SELECT id FROM staff WHERE id = ${deposit.agentId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const owner = await tx.staff.findFirst({
        where: { id: deposit.agentId, organizationId },
        select: { branchId: true },
      });
      if (
        !owner ||
        (actor.role === 'branch_manager' && owner.branchId !== actor.branchId)
      )
        throw new NotFoundException('Cash deposit not found');

      let newNotes = deposit.notes;
      if (dto.notes) {
        newNotes = deposit.notes
          ? `${deposit.notes}\nVerifier: ${dto.notes}`
          : dto.notes;
      }

      const updated = await tx.cashDeposit.update({
        where: { id, organizationId, status: 'pending' },
        data: {
          status: dto.status,
          verifiedById: verifierId,
          verifiedAt: new Date(),
          notes: newNotes,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorStaffId: verifierId,
          action: 'cash_handover.reviewed',
          entityType: 'CashDeposit',
          entityId: id,
          oldValue: { status: 'pending' },
          newValue: { status: dto.status, agentId: deposit.agentId },
        },
      });
      return updated;
    });
  }

  async getReconciliation(
    organizationId: string,
    startDate: string,
    endDate: string,
    user: AuthenticatedUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      if (user.type !== 'staff' || user.organizationId !== organizationId)
        throw new ForbiddenException();
      const actor = await this.actor(tx, organizationId, user.id);
      if (!['org_admin', 'branch_manager', 'accountant'].includes(actor.role))
        throw new ForbiddenException();
      addPeriods(startDate, 0, 'daily');
      addPeriods(endDate, 0, 'daily');
      if (startDate > endDate)
        throw new BadRequestException('Invalid reconciliation date range');
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setUTCDate(end.getUTCDate() + 1);

      const agents = await tx.staff.findMany({
        where: {
          organizationId,
          role: 'agent',
          isActive: true,
          ...(actor.role === 'branch_manager'
            ? { branchId: actor.branchId }
            : {}),
        },
        select: { id: true, fullName: true },
      });

      return Promise.all(
        agents.map(async (agent) => {
          const collections = await tx.collection.aggregate({
            where: {
              organizationId,
              collectedById: agent.id,
              collectionDate: { gte: start, lt: end },
              status: { in: ['recorded', 'verified'] },
              collectionMethod: 'cash',
            },
            _sum: { amount: true },
          });

          const deposits = await tx.cashDeposit.aggregate({
            where: {
              organizationId,
              agentId: agent.id,
              depositDate: { gte: start, lt: end },
              status: 'verified',
            },
            _sum: { amount: true },
          });

          const collected = collections._sum.amount?.toNumber() || 0;
          const deposited = deposits._sum.amount?.toNumber() || 0;

          return {
            agentId: agent.id,
            agentName: agent.fullName,
            totalCollected: collected,
            totalDeposited: deposited,
            difference: Math.round((collected - deposited) * 100) / 100,
            status: collected === deposited ? 'balanced' : 'discrepancy',
          };
        }),
      );
    });
  }
}
