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

  async getReconciliation(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const result = await tx.$queryRaw`
        SELECT
          s.id as agent_id,
          s.full_name as agent_name,
          COALESCE(col_sum.total, 0) as total_collected,
          COALESCE(dep_sum.total, 0) as total_deposited,
          COALESCE(col_sum.total, 0) - COALESCE(dep_sum.total, 0) as delta
        FROM "staff" s
        LEFT JOIN (
          SELECT collected_by, SUM(amount) as total
          FROM "collections"
          WHERE status IN ('recorded', 'verified') AND organization_id = ${organizationId}::uuid
          GROUP BY collected_by
        ) col_sum ON col_sum.collected_by = s.id
        LEFT JOIN (
          SELECT agent_id, SUM(amount) as total
          FROM "cash_deposits"
          WHERE status = 'verified' AND organization_id = ${organizationId}::uuid
          GROUP BY agent_id
        ) dep_sum ON dep_sum.agent_id = s.id
        WHERE s.organization_id = ${organizationId}::uuid AND s.role = 'agent'
      `;
      
      // Convert BigInts from raw query to strings or numbers
      return Array.isArray(result) ? result.map((row: any) => ({
        ...row,
        total_collected: row.total_collected ? Number(row.total_collected) : 0,
        total_deposited: row.total_deposited ? Number(row.total_deposited) : 0,
        delta: row.delta ? Number(row.delta) : 0,
      })) : result;
    });
  }
}
