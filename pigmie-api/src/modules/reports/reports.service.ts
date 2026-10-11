import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { Prisma } from '@prisma/client';
import {
  OverdueQueryDto,
  CollectionEfficiencyQueryDto,
} from './dto/query-reports.dto';
import {
  AuthenticatedUser,
  StaffUser,
} from '../../common/types/request-user.type';

@Injectable()
export class ReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async resolveStaff(
    tx: Prisma.TransactionClient,
    organizationId: string,
    user: AuthenticatedUser,
  ): Promise<StaffUser> {
    if (user.type !== 'staff' || user.organizationId !== organizationId)
      throw new ForbiddenException();
    const staff = await tx.staff.findUnique({
      where: { id: user.id, organizationId, isActive: true },
      select: { id: true, role: true, branchId: true },
    });
    if (!staff || (staff.role === 'branch_manager' && !staff.branchId))
      throw new ForbiddenException('Staff report scope is unavailable');
    return { ...staff, type: 'staff', organizationId };
  }

  private sanitizeCsvField(field: string): string {
    let sanitized = String(field ?? '');
    // Prevent formula injection
    if (/^[=+\-@\t\r]/.test(sanitized)) {
      sanitized = "'" + sanitized;
    }
    // Escape quotes and wrap in quotes
    return '"' + sanitized.replace(/"/g, '""') + '"';
  }

  async getDashboardSummary(organizationId: string, user: AuthenticatedUser) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const istDateStr = istNow.toISOString().split('T')[0];
      const todayDate = new Date(istDateStr + 'T00:00:00.000Z');
      const monthStartStr = istDateStr.slice(0, 7) + '-01';
      const monthStartDate = new Date(monthStartStr + 'T00:00:00.000Z');

      // 1. Get staff scoping rules
      const staff = await this.resolveStaff(tx, organizationId, user);
      const isAgent = staff.role === 'agent';
      const isBranchManager = staff.role === 'branch_manager';

      const loanWhere: Prisma.LoanWhereInput = {
        organizationId,
        status: 'active',
      };
      const collectionTodayWhere: Prisma.CollectionWhereInput = {
        organizationId,
        collectionDate: todayDate,
        status: { in: ['recorded', 'verified'] },
      };
      const collectionMonthWhere: Prisma.CollectionWhereInput = {
        organizationId,
        collectionDate: { gte: monthStartDate, lte: todayDate },
        status: { in: ['recorded', 'verified'] },
      };

      if (isAgent && staff?.id) {
        loanWhere.assignedAgentId = staff.id;
        collectionTodayWhere.collectedById = staff.id;
        collectionMonthWhere.collectedById = staff.id;
      } else if (isBranchManager && staff?.branchId) {
        loanWhere.customer = { branchId: staff.branchId };
        collectionTodayWhere.loan = { customer: { branchId: staff.branchId } };
        collectionMonthWhere.loan = { customer: { branchId: staff.branchId } };
      }

      const [
        activeLoansCount,
        activeLoans,
        collectionsToday,
        collectionsThisMonth,
        dueTodaySchedules,
        overdueCount,
      ] = await Promise.all([
        tx.loan.count({ where: loanWhere }),
        tx.loan.findMany({ where: loanWhere }),
        tx.collection.findMany({ where: collectionTodayWhere }),
        tx.collection.aggregate({
          where: collectionMonthWhere,
          _sum: { amount: true },
        }),
        tx.loanSchedule.findMany({
          where: {
            loan: loanWhere,
            dueDate: todayDate, // Exact date match for @db.Date
            status: { in: ['pending', 'partially_paid'] },
          },
        }),
        tx.loanSchedule.count({
          where: { loan: loanWhere, status: 'overdue' },
        }),
      ]);

      const totalOutstanding = activeLoans.reduce(
        (sum, loan) => sum + loan.outstandingBalance.toNumber(),
        0,
      );
      const collectedToday = collectionsToday.reduce(
        (sum, col) => sum + col.amount.toNumber(),
        0,
      );
      const dueToday = dueTodaySchedules.reduce(
        (sum, sch) =>
          sum + sch.dueAmount.toNumber() - sch.paidAmount.toNumber(),
        0,
      );
      const thisMonthCollection =
        collectionsThisMonth._sum.amount?.toNumber() || 0;
      const collectionEfficiency =
        dueToday > 0
          ? Math.round((collectedToday / dueToday) * 100)
          : collectedToday > 0
            ? 100
            : 0;

      const parStats = await tx.$queryRaw<{ par_30: Prisma.Decimal | null }[]>`
        select
          sum(case when overdue_days > 30 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_30
        from "loans" l
        ${staff.role === 'branch_manager' && staff.branchId ? Prisma.sql`join "customers" c on c.id = l.customer_id and c.organization_id = l.organization_id` : Prisma.empty}
        join lateral (
          select coalesce(max(current_date - s.due_date), 0) as overdue_days
          from "loan_schedule" s
          where s.loan_id = l.id and s.status in ('pending', 'partially_paid', 'overdue')
        ) x on true
        where l.status = 'active' and l.organization_id = ${organizationId}::uuid
        ${staff.role === 'branch_manager' && staff.branchId ? Prisma.sql`and c.branch_id = ${staff.branchId}::uuid` : Prisma.empty}
        ${staff.role === 'agent' ? Prisma.sql`and l.assigned_agent_id = ${staff.id}::uuid` : Prisma.empty}
      `;
      const portfolioAtRisk30 = parStats[0]?.par_30
        ? Number(parStats[0].par_30)
        : 0;

      return {
        activeLoans: activeLoansCount,
        totalOutstanding,
        collectedToday,
        dueToday,
        collectionEfficiency,
        thisMonthCollection,
        overdueCount,
        portfolioAtRisk30,
      };
    });
  }

  async getOverdue(
    organizationId: string,
    query: OverdueQueryDto,
    user: AuthenticatedUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const page = query.page || 1;
      const limit = query.limit || 20;
      const staff = await this.resolveStaff(tx, organizationId, user);
      const loanWhere: Prisma.LoanWhereInput = {
        organizationId,
        status: 'active',
      };

      const where: Prisma.LoanScheduleWhereInput = {
        loan: loanWhere,
        status: 'overdue',
      };

      if (staff.role === 'branch_manager')
        loanWhere.customer = { branchId: staff.branchId };
      else if (query.branchId)
        loanWhere.customer = { branchId: query.branchId };
      if (staff.role === 'agent') loanWhere.assignedAgentId = staff.id;
      else if (query.agentId) loanWhere.assignedAgentId = query.agentId;
      if (query.minDaysOverdue) {
        const d = new Date();
        d.setDate(d.getDate() - query.minDaysOverdue);
        where.dueDate = { lte: d };
      }

      const total = await tx.loanSchedule.count({ where });
      const data = await tx.loanSchedule.findMany({
        where,
        include: {
          loan: {
            include: {
              customer: { select: { id: true, fullName: true, phone: true } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async getPortfolioAtRisk(organizationId: string, user: AuthenticatedUser) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const staff = await this.resolveStaff(tx, organizationId, user);
      const result = await tx.$queryRaw<
        {
          par_1: Prisma.Decimal | null;
          par_30: Prisma.Decimal | null;
          par_90: Prisma.Decimal | null;
        }[]
      >`
        select
          sum(case when overdue_days > 1 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_1,
          sum(case when overdue_days > 30 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_30,
          sum(case when overdue_days > 90 then l.outstanding_balance else 0 end) / nullif(sum(l.outstanding_balance), 0) as par_90
        from "loans" l
        ${staff.role === 'branch_manager' && staff.branchId ? Prisma.sql`join "customers" c on c.id = l.customer_id and c.organization_id = l.organization_id` : Prisma.empty}
        join lateral (
          select coalesce(max(current_date - s.due_date), 0) as overdue_days
          from "loan_schedule" s
          where s.loan_id = l.id and s.status in ('pending', 'partially_paid', 'overdue')
        ) x on true
        where l.status = 'active' and l.organization_id = ${organizationId}::uuid
        ${staff.role === 'branch_manager' && staff.branchId ? Prisma.sql`and c.branch_id = ${staff.branchId}::uuid` : Prisma.empty}
        ${staff.role === 'agent' ? Prisma.sql`and l.assigned_agent_id = ${staff.id}::uuid` : Prisma.empty}
      `;

      return {
        par_1: result[0]?.par_1 ? Number(result[0].par_1) : 0,
        par_30: result[0]?.par_30 ? Number(result[0].par_30) : 0,
        par_90: result[0]?.par_90 ? Number(result[0].par_90) : 0,
      };
    });
  }

  async getCollectionEfficiency(
    organizationId: string,
    _query: CollectionEfficiencyQueryDto,
    caller: AuthenticatedUser,
  ) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const user = await this.resolveStaff(tx, organizationId, caller);
      const result = await tx.$queryRaw<Record<string, unknown>[]>`
        SELECT
          s.id as staff_id,
          s.full_name as agent_name,
          COALESCE(sched.total_due, 0)::float as total_due,
          COALESCE(sched.total_collected, 0)::float as total_collected,
          CASE
            WHEN COALESCE(sched.total_due, 0) = 0 THEN 0
            ELSE ROUND((COALESCE(sched.total_collected, 0) / COALESCE(sched.total_due, 0)) * 100, 2)::float
          END as efficiency_percent
        FROM "staff" s
        LEFT JOIN (
          SELECT c.assigned_agent_id, SUM(ls.due_amount) as total_due, SUM(ls.paid_amount) as total_collected
          FROM "customers" c
          JOIN "loans" l ON l.customer_id = c.id AND l.organization_id = c.organization_id AND l.status = 'active'
          JOIN "loan_schedule" ls ON ls.loan_id = l.id AND ls.due_date <= CURRENT_DATE
          WHERE c.organization_id = ${organizationId}::uuid
            ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`AND c.branch_id = ${user.branchId}::uuid` : Prisma.empty}
          GROUP BY c.assigned_agent_id
        ) sched ON sched.assigned_agent_id = s.id
        WHERE s.organization_id = ${organizationId}::uuid
          AND s.role = 'agent'
          AND s.is_active = true
          ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`AND EXISTS (SELECT 1 FROM "customers" c WHERE c.assigned_agent_id = s.id AND c.branch_id = ${user.branchId}::uuid)` : Prisma.empty}
        ORDER BY efficiency_percent DESC
      `;
      return { data: result };
    });
  }

  async getAgentPerformance(organizationId: string, caller: AuthenticatedUser) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const user = await this.resolveStaff(tx, organizationId, caller);
      const result = await tx.$queryRaw<Record<string, unknown>[]>`
        SELECT
          s.id as staff_id,
          s.full_name as agent_name,
          COALESCE(coll.collections_made, 0)::int as collections_made,
          COALESCE(coll.total_collected, 0)::float as total_collected,
          COALESCE(cust.customers_assigned, 0)::int as customers_assigned
        FROM "staff" s
        LEFT JOIN (
          SELECT assigned_agent_id, COUNT(id) as customers_assigned
          FROM "customers"
          WHERE organization_id = ${organizationId}::uuid
            ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`AND branch_id = ${user.branchId}::uuid` : Prisma.empty}
          GROUP BY assigned_agent_id
        ) cust ON cust.assigned_agent_id = s.id
        LEFT JOIN (
          SELECT col.collected_by, COUNT(col.id) as collections_made, SUM(col.amount) as total_collected
          FROM "collections" col
          JOIN "customers" c ON c.id = col.customer_id AND c.organization_id = col.organization_id
          WHERE col.organization_id = ${organizationId}::uuid
            AND col.status IN ('recorded', 'verified')
            ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`AND c.branch_id = ${user.branchId}::uuid` : Prisma.empty}
          GROUP BY collected_by
        ) coll ON coll.collected_by = s.id
        WHERE s.organization_id = ${organizationId}::uuid
          AND s.role = 'agent'
          AND s.is_active = true
          ${user.role === 'branch_manager' && user.branchId ? Prisma.sql`AND EXISTS (SELECT 1 FROM "customers" c WHERE c.assigned_agent_id = s.id AND c.branch_id = ${user.branchId}::uuid)` : Prisma.empty}
        ORDER BY total_collected DESC
      `;
      return { data: result };
    });
  }

  async exportData(
    organizationId: string,
    type: string,
    user: AuthenticatedUser,
  ): Promise<string> {
    return this.tenantPrisma.runAtomic(organizationId, async (tx) => {
      if (user.type !== 'staff' || user.organizationId !== organizationId)
        throw new ForbiddenException();
      await tx.$queryRaw`SELECT id FROM staff WHERE id = ${user.id}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
      const actor = await this.resolveStaff(tx, organizationId, user);
      if (actor.role !== 'org_admin') throw new ForbiddenException();
      if (type === 'par') {
        const result = await this.getPortfolioAtRisk(organizationId, actor);
        return this.csv(
          ['overdueDays', 'portfolioAtRiskPercent'],
          [
            [1, result.par_1 * 100],
            [30, result.par_30 * 100],
            [90, result.par_90 * 100],
          ],
        );
      }
      if (type === 'efficiency' || type === 'agents') {
        const { data } =
          type === 'efficiency'
            ? await this.getCollectionEfficiency(organizationId, {}, actor)
            : await this.getAgentPerformance(organizationId, actor);
        const fields =
          type === 'efficiency'
            ? [
                'staff_id',
                'agent_name',
                'total_due',
                'total_collected',
                'efficiency_percent',
              ]
            : [
                'staff_id',
                'agent_name',
                'collections_made',
                'total_collected',
                'customers_assigned',
              ];
        return this.csv(
          fields,
          data.map((row) => fields.map((field) => row[field])),
        );
      }
      return this.exportRecords(tx, organizationId, type);
    });
  }

  private csv(headers: string[], rows: unknown[][]): string {
    return `${headers.join(',')}\n${rows
      .map((row) =>
        row
          .map((value) => {
            if (value === null || value === undefined)
              return this.sanitizeCsvField('');
            if (
              typeof value !== 'string' &&
              typeof value !== 'number' &&
              typeof value !== 'boolean' &&
              typeof value !== 'bigint'
            )
              throw new BadRequestException('Invalid report export field');
            return this.sanitizeCsvField(String(value));
          })
          .join(','),
      )
      .join('\n')}`;
  }

  private async exportRecords(
    tx: Prisma.TransactionClient,
    organizationId: string,
    type: string,
  ): Promise<string> {
    if (type === 'customers') {
      const data = await tx.customer.findMany({
        where: { organizationId },
        select: { id: true, fullName: true },
      });
      if (!data.length) return 'id,fullName\n';
      return (
        `id,fullName\n` +
        data
          .map(
            (c) =>
              `${this.sanitizeCsvField(c.id)},${this.sanitizeCsvField(c.fullName)}`,
          )
          .join('\n')
      );
    } else if (type === 'loans') {
      const data = await tx.loan.findMany({
        where: { organizationId },
        select: { id: true, principalAmount: true, status: true },
      });
      if (!data.length) return 'id,amount,status\n';
      return (
        `id,amount,status\n` +
        data
          .map(
            (c) =>
              `${this.sanitizeCsvField(c.id)},${this.sanitizeCsvField(c.principalAmount.toString())},${this.sanitizeCsvField(c.status)}`,
          )
          .join('\n')
      );
    }
    if (type === 'collections') {
      const data = await tx.collection.findMany({
        where: { organizationId },
        select: {
          id: true,
          loanId: true,
          amount: true,
          collectionDate: true,
          status: true,
          receiptNumber: true,
        },
      });
      return this.csv(
        ['id', 'loanId', 'amount', 'collectionDate', 'status', 'receiptNumber'],
        data.map((row) => [
          row.id,
          row.loanId,
          row.amount.toString(),
          row.collectionDate.toISOString().slice(0, 10),
          row.status,
          row.receiptNumber,
        ]),
      );
    }
    if (type === 'schedule') {
      const data = await tx.loanSchedule.findMany({
        where: { loan: { organizationId } },
        select: {
          id: true,
          loanId: true,
          installmentNumber: true,
          dueDate: true,
          dueAmount: true,
          paidAmount: true,
          status: true,
        },
      });
      return this.csv(
        [
          'id',
          'loanId',
          'installmentNumber',
          'dueDate',
          'dueAmount',
          'paidAmount',
          'status',
        ],
        data.map((row) => [
          row.id,
          row.loanId,
          row.installmentNumber,
          row.dueDate.toISOString().slice(0, 10),
          row.dueAmount.toString(),
          row.paidAmount.toString(),
          row.status,
        ]),
      );
    }
    throw new BadRequestException('Unsupported report export type');
  }

  async getBranchComparison(organizationId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const today = new Date();
      const firstDayOfMonth = new Date(
        today.getFullYear(),
        today.getMonth(),
        1,
      );

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
