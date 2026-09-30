import { Injectable, NotFoundException } from '@nestjs/common';
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

  async create(organizationId: string, agentId: string, dto: CreateCashDepositDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
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
      return cashDeposit;
    });
  }

  async findAll(organizationId: string, query: any) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const where: any = { organizationId };
      if (query.agentId) where.agentId = query.agentId;
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

  async verify(organizationId: string, id: string, verifierId: string, dto: VerifyCashDepositDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const deposit = await tx.cashDeposit.findFirst({
        where: { id, organizationId, status: 'pending' },
      });
      if (!deposit) {
        throw new NotFoundException('Cash deposit not found or already verified');
      }

      let newNotes = deposit.notes;
      if (dto.notes) {
        newNotes = deposit.notes ? `${deposit.notes}\nVerifier: ${dto.notes}` : dto.notes;
      }

      const updated = await tx.cashDeposit.update({
        where: { id },
        data: {
          status: dto.status as any,
          verifiedById: verifierId,
          verifiedAt: new Date(),
          notes: newNotes,
        },
      });
      return updated;
    });
  }

  async getReconciliation(organizationId: string, startDate: string, endDate: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);

      const agents = await tx.staff.findMany({
        where: { organizationId, role: 'agent', isActive: true },
        select: { id: true, fullName: true },
      });

      return Promise.all(agents.map(async (agent) => {
        const collections = await tx.collection.aggregate({
          where: {
            organizationId,
            collectedById: agent.id,
            collectionDate: { gte: start, lt: end },
            status: { in: ['recorded', 'verified'] },
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
      }));
    });
  }
}
