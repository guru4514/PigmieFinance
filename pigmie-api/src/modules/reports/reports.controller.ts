import { Controller, Get, Query, UseGuards, Res, ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { ReportsService } from './reports.service';
import { OverdueQueryDto, CollectionEfficiencyQueryDto, ExportQueryDto, ReportQueryDto } from './dto/query-reports.dto';

@Controller('reports')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard-summary')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async getDashboardSummary(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.reportsService.getDashboardSummary(user.organizationId, user);
  }

  @Get('overdue')
  @Roles('org_admin', 'branch_manager')
  async getOverdue(@Query() query: OverdueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.reportsService.getOverdue(user.organizationId, query, user);
  }

  @Get('portfolio-at-risk')
  @Roles('org_admin', 'branch_manager')
  async getPortfolioAtRisk(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.reportsService.getPortfolioAtRisk(user.organizationId, user);
  }

  @Get('collection-efficiency')
  @Roles('org_admin', 'branch_manager')
  async getCollectionEfficiency(@Query() query: CollectionEfficiencyQueryDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.reportsService.getCollectionEfficiency(user.organizationId, query, user);
  }

  @Get('agent-performance')
  @Roles('org_admin', 'branch_manager')
  async getAgentPerformance(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.reportsService.getAgentPerformance(user.organizationId, user);
  }

  @Get('export')
  @Roles('org_admin')
  async exportData(@Query() query: ExportQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    if (user.type !== 'staff') throw new ForbiddenException();
    const csvString = await this.reportsService.exportData(user.organizationId, query.type);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${query.type}-export.csv`);
    res.send(csvString);
  }

  @Get('branch-comparison')
  @Roles('org_admin')
  async getBranchComparison(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.reportsService.getBranchComparison(user.organizationId);
  }
}


