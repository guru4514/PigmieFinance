import {
  Controller, Get, Post, Param, Query, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { DisburseLoanDto } from './dto/disburse-loan.dto';
import { RejectLoanDto } from './dto/reject-loan.dto';
import { WriteOffLoanDto } from './dto/write-off-loan.dto';
import { QueryLoanDto } from './dto/query-loan.dto';

@Controller('loans')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryLoanDto) {
    return this.loansService.findAll(user.organizationId, user, query);
  }

  @Get(':id')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.loansService.findOne(user.organizationId, id);
  }

  @Post()
  @Roles('org_admin', 'branch_manager', 'agent')
  @AuditAction('loan.create')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLoanDto) {
    return this.loansService.create(user.organizationId, user.id, dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin', 'branch_manager')
  @AuditAction('loan.approve')
  async approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.loansService.approve(user.organizationId, id, user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin', 'branch_manager')
  @AuditAction('loan.reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectLoanDto,
  ) {
    return this.loansService.reject(user.organizationId, id, user.id, dto.reason);
  }

  @Post(':id/disburse')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin', 'branch_manager')
  @AuditAction('loan.disburse')
  async disburse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DisburseLoanDto,
  ) {
    return this.loansService.disburse(user.organizationId, id, dto.startDate, user.id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin', 'branch_manager')
  @AuditAction('loan.close')
  async close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.loansService.close(user.organizationId, id);
  }

  @Post(':id/write-off')
  @HttpCode(HttpStatus.OK)
  @Roles('org_admin')
  @AuditAction('loan.write_off')
  async writeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: WriteOffLoanDto,
  ) {
    return this.loansService.writeOff(user.organizationId, id, dto.reason);
  }

  @Get(':id/schedule')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async getSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.loansService.getSchedule(user.organizationId, id);
  }
}

