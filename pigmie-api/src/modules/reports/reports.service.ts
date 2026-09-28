import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { Prisma } from '@prisma/client';
import { OverdueQueryDto, CollectionEfficiencyQueryDto } from './dto/query-reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getDashboardSummary(organizationId: string, user: any) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const loanWhere: any = { organizationId, status: 'active' };
      const collectionWhere: any = { organizationId, collectionDate: { gte: today, lt: tomorrow }, status: { in: ['recorded', 'verified'] } };

      if (user.role === 'branch_manager' && user.branchId) {
        loanWhere.customer = { branchId: user.branchId };
        collectionWhere.customer = { branchId: user.branchId };
      }

      const activeLoansCount = await tx.loan.count({ where: loanWhere });
      const activeLoans = await tx.loan.findMany({ where: loanWhere });
      const totalOutstanding = activeLoans.reduce((sum, loan) => sum + loan.outstandingBalance.toNumber(), 0);

      const collectionsToday = await tx.collection.findMany({ where: collectionWhere });
      const collectedToday = collectionsToday.reduce((sum, col) => sum + col.amount.toNumber(), 0);

      const dueTodaySchedules = await tx.loanSchedule.findMany({
        where: { loan: loanWhere, dueDate: { gte: today, lt: tomorrow }, status: { in: ['pending', 'partially_paid'] } }
      });
      const dueToday = dueTodaySchedules.reduce((sum, sch) => sum + sch.dueAmount.toNumber(), 0);

      const overdueCount = await tx.loanSchedule.count({
        where: { loan: loanWhere, status: 'overdue' }
      });

      const parStats: any[] = await tx.$queryRaw`
        select
          sum(case when overdue_days > 30 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_30
        from "loans" l
        ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`join "customers" c on c.id = l.customer_id` : Prisma.empty}
        join lateral (
          select coalesce(max(current_date - s.due_date), 0) as overdue_days
          from "loan_schedule" s
          where s.loan_id = l.id and s.status in ('pending', 'partially_paid', 'overdue')
        ) x on true
        where l.status = 'active' and l.organization_id = ${organizationId}::uuid
        ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`and c.branch_id = ${user.branchId}::uuid` : Prisma.empty}
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

  async getOverdue(organizationId: string, query: OverdueQueryDto, user: any) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page || 1;
      const limit = query.limit || 20;

      const where: Prisma.LoanScheduleWhereInput = {
        loan: { organizationId, status: 'active' },
        status: 'overdue',
      };
      
      if (user.role === 'branch_manager' && user.branchId) {
        (where.loan as any) = { ...where.loan, customer: { branchId: user.branchId } };
        if (query.agentId) {
          (where.loan as any).assignedAgentId = query.agentId;
        }
      } else {
        if (query.branchId) {
          (where.loan as any) = { ...where.loan, customer: { branchId: query.branchId } };
        }
        if (query.agentId) {
          (where.loan as any) = { ...where.loan, assignedAgentId: query.agentId };
        }
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

  async getPortfolioAtRisk(organizationId: string, user: any) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const result: any[] = await tx.$queryRaw`
        select
          sum(case when overdue_days > 1 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_1,
          sum(case when overdue_days > 30 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_30,
          sum(case when overdue_days > 90 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_90
        from "loans" l
        ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`join "customers" c on c.id = l.customer_id` : Prisma.empty}
        join lateral (
          select coalesce(max(current_date - s.due_date), 0) as overdue_days
          from "loan_schedule" s
          where s.loan_id = l.id and s.status in ('pending', 'partially_paid', 'overdue')
        ) x on true
        where l.status = 'active' and l.organization_id = ${organizationId}::uuid
        ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`and c.branch_id = ${user.branchId}::uuid` : Prisma.empty}
      `;
      
      return {
        par_1: result[0]?.par_1 ? Number(result[0].par_1) : 0,
        par_30: result[0]?.par_30 ? Number(result[0].par_30) : 0,
        par_90: result[0]?.par_90 ? Number(result[0].par_90) : 0,
      };
    });
  }

  async getCollectionEfficiency(organizationId: string, query: CollectionEfficiencyQueryDto, user: any) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const result = await tx.$queryRaw<any[]>`
        SELECT
          s.id as staff_id,
          s.full_name as agent_name,
          COALESCE(SUM(ls.due_amount), 0)::float as total_due,
          COALESCE(SUM(ls.paid_amount), 0)::float as total_collected,
          CASE
            WHEN COALESCE(SUM(ls.due_amount), 0) = 0 THEN 0
            ELSE ROUND((COALESCE(SUM(ls.paid_amount), 0) / COALESCE(SUM(ls.due_amount), 0)) * 100, 2)::float
          END as efficiency_percent
        FROM "staff" s
        LEFT JOIN "customers" c ON c.assigned_agent_id = s.id AND c.organization_id = s.organization_id
        LEFT JOIN "loans" l ON l.customer_id = c.id AND l.organization_id = s.organization_id AND l.status = 'active'
        LEFT JOIN "loan_schedule" ls ON ls.loan_id = l.id
          AND ls.due_date <= CURRENT_DATE
        WHERE s.organization_id = ${organizationId}::uuid
          AND s.role = 'agent'
          AND s.is_active = true
          ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`AND c.branch_id = ${user.branchId}::uuid` : Prisma.empty}
        GROUP BY s.id, s.full_name
        ORDER BY efficiency_percent DESC
      `;
      return { data: result };
    });
  }

  async getAgentPerformance(organizationId: string, user: any) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const result = await tx.$queryRaw<any[]>`
        SELECT
          s.id as staff_id,
          s.full_name as agent_name,
          COUNT(DISTINCT c2.id)::int as collections_made,
          COALESCE(SUM(c2.amount), 0)::float as total_collected,
          COUNT(DISTINCT c.id)::int as customers_assigned
        FROM "staff" s
        LEFT JOIN "customers" c ON c.assigned_agent_id = s.id AND c.organization_id = s.organization_id
        LEFT JOIN "collections" c2 ON c2.collected_by = s.id
          AND c2.organization_id = s.organization_id
          AND c2.status IN ('recorded', 'verified')
        WHERE s.organization_id = ${organizationId}::uuid
          AND s.role = 'agent'
          AND s.is_active = true
          ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`AND c.branch_id = ${user.branchId}::uuid` : Prisma.empty}
        GROUP BY s.id, s.full_name
        ORDER BY total_collected DESC
      `;
      return { data: result };
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

  async getBranchComparison(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const result = await tx.$queryRaw<any[]>`
        SELECT
          b.id as branch_id,
          b.name as branch_name,
          COUNT(DISTINCT l.id)::int as active_loans_count,
          COALESCE(SUM(l.outstanding_balance), 0)::float as total_outstanding_amount,
          COALESCE((
            SELECT SUM(col.amount)
            FROM "collections" col
            JOIN "customers" cust ON col.customer_id = cust.id
            WHERE col.organization_id = ${organizationId}::uuid
              AND cust.branch_id = b.id
              AND col.collection_date >= ${firstDayOfMonth}::date
              AND col.status IN ('recorded', 'verified')
          ), 0)::float as collections_this_month,
          (
            SELECT COUNT(DISTINCT s.id)
            FROM "loan_schedule" s
            JOIN "loans" ln ON s.loan_id = ln.id
            JOIN "customers" cu ON ln.customer_id = cu.id
            WHERE s.status = 'overdue'
              AND cu.branch_id = b.id
              AND ln.status = 'active'
              AND ln.organization_id = ${organizationId}::uuid
          )::int as overdue_count,
          COUNT(DISTINCT c.id)::int as number_of_customers,
          (
            SELECT COUNT(DISTINCT st.id)
            FROM "staff" st
            WHERE st.branch_id = b.id AND st.is_active = true
          )::int as number_of_agents
        FROM "branches" b
        LEFT JOIN "customers" c ON c.branch_id = b.id AND c.organization_id = b.organization_id
        LEFT JOIN "loans" l ON l.customer_id = c.id AND l.status = 'active'
        WHERE b.organization_id = ${organizationId}::uuid
          AND b.is_active = true
        GROUP BY b.id, b.name
        ORDER BY b.name ASC
      `;
      
      return { data: result };
    });
  }
}

