import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { Prisma } from '@prisma/client';
import { OverdueQueryDto, CollectionEfficiencyQueryDto } from './dto/query-reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getDashboardSummary(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const activeLoansCount = await tx.loan.count({ where: { organizationId, status: 'active' } });
      const activeLoans = await tx.loan.findMany({ where: { organizationId, status: 'active' } });
      const totalOutstanding = activeLoans.reduce((sum, loan) => sum + loan.outstandingBalance.toNumber(), 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const collectionsToday = await tx.collection.findMany({
        where: { organizationId, collectionDate: { gte: today, lt: tomorrow }, status: { in: ['recorded', 'verified'] } }
      });
      const collectedToday = collectionsToday.reduce((sum, col) => sum + col.amount.toNumber(), 0);

      const dueTodaySchedules = await tx.loanSchedule.findMany({
        where: { loan: { organizationId }, dueDate: { gte: today, lt: tomorrow }, status: { in: ['pending', 'partially_paid'] } }
      });
      const dueToday = dueTodaySchedules.reduce((sum, sch) => sum + sch.dueAmount.toNumber(), 0);

      const overdueCount = await tx.loanSchedule.count({
        where: { loan: { organizationId }, status: 'overdue' }
      });

      const parStats: any[] = await tx.$queryRaw`
        select
          sum(case when overdue_days > 30 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_30
        from "Loan" l
        join lateral (
          select coalesce(max(current_date - s.due_date), 0) as overdue_days
          from "LoanSchedule" s
          where s.loan_id = l.id and s.status in ('pending', 'partially_paid', 'overdue')
        ) x on true
        where l.status = 'active' and l.organization_id = ${organizationId}::uuid
      `;
      const portfolioAtRisk30 = parStats[0]?.par_30 ? Number(parStats[0].par_30) : 0;

      return {
        activeLoans: activeLoansCount,
        totalOutstanding,
        collectedToday,
        dueToday,
        overdueCount,
        portfolioAtRisk30
      };
    });
  }

  async getOverdue(organizationId: string, query: OverdueQueryDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page || 1;
      const limit = query.limit || 20;

      const where: Prisma.LoanScheduleWhereInput = {
        loan: { organizationId, status: 'active' },
        status: 'overdue',
      };
      
      if (query.branchId) {
        (where.loan as any) = { ...where.loan, customer: { branchId: query.branchId } };
      }
      if (query.agentId) {
        (where.loan as any) = { ...where.loan, assignedAgentId: query.agentId };
      }
      if (query.minDaysOverdue) {
        const d = new Date();
        d.setDate(d.getDate() - query.minDaysOverdue);
        where.dueDate = { lte: d };
      }

      const total = await tx.loanSchedule.count({ where });
      const data = await tx.loanSchedule.findMany({
        where,
        include: { loan: { include: { customer: true } } },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    });
  }

  async getPortfolioAtRisk(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const result: any[] = await tx.$queryRaw`
        select
          sum(case when overdue_days > 1 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_1,
          sum(case when overdue_days > 30 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_30,
          sum(case when overdue_days > 90 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_90
        from "Loan" l
        join lateral (
          select coalesce(max(current_date - s.due_date), 0) as overdue_days
          from "LoanSchedule" s
          where s.loan_id = l.id and s.status in ('pending', 'partially_paid', 'overdue')
        ) x on true
        where l.status = 'active' and l.organization_id = ${organizationId}::uuid
      `;
      
      return {
        par_1: result[0]?.par_1 ? Number(result[0].par_1) : 0,
        par_30: result[0]?.par_30 ? Number(result[0].par_30) : 0,
        par_90: result[0]?.par_90 ? Number(result[0].par_90) : 0,
      };
    });
  }

  async getCollectionEfficiency(organizationId: string, query: CollectionEfficiencyQueryDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return { efficiency: 0.95 }; // Stub for now
    });
  }

  async getAgentPerformance(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const agents = await tx.staff.findMany({
        where: { organizationId, role: 'agent' },
        include: { assignedCustomers: true }
      });
      return agents.map(agent => ({
        agentId: agent.id,
        fullName: agent.fullName,
        customersAssigned: agent.assignedCustomers.length,
        collectionsMade: 0,
        collectionEfficiency: 0.95
      }));
    });
  }

  async exportData(organizationId: string, type: string): Promise<string> {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      if (type === 'customers') {
        const data = await tx.customer.findMany({ where: { organizationId } });
        if (!data.length) return 'id,fullName\n';
        return `id,fullName\n` + data.map(c => `${c.id},${c.fullName}`).join('\n');
      } else if (type === 'loans') {
        const data = await tx.loan.findMany({ where: { organizationId } });
        if (!data.length) return 'id,amount,status\n';
        return `id,amount,status\n` + data.map(c => `${c.id},${c.principalAmount},${c.status}`).join('\n');
      }
      return 'id\n';
    });
  }
}

