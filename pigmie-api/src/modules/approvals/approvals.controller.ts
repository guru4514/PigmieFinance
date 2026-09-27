import {
  Controller, Get, Post, Param, Query, Body, UseGuards, HttpCode, HttpStatus
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { ApprovalsService } from './approvals.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { ReviewApprovalDto } from './dto/review-approval.dto';

@Controller('approvals')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApprovalDto) {
    return this.approvalsService.create(user.organizationId, user.id, dto);
  }

  @Get('pending/count')
  @Roles('org_admin', 'branch_manager')
  async getPendingCount(@CurrentUser() user: AuthenticatedUser) {
    return this.approvalsService.getPendingCount(user.organizationId);
  }

  @Get()
  @Roles('org_admin', 'branch_manager', 'agent')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: any) {
    return this.approvalsService.findAll(user.organizationId, query, user);
  }

  @Get(':id')
  @Roles('org_admin', 'branch_manager', 'agent')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvalsService.findOne(user.organizationId, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin', 'branch_manager')
  async approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvalsService.approve(user.organizationId, id, user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin', 'branch_manager')
  async reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReviewApprovalDto) {
    return this.approvalsService.reject(user.organizationId, id, user.id, dto);
  }
}
