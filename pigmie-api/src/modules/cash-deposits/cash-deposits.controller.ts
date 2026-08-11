import {
  Controller, Get, Post, Param, Query, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { CashDepositsService } from './cash-deposits.service';
import { CreateCashDepositDto } from './dto/create-cash-deposit.dto';
import { VerifyCashDepositDto } from './dto/verify-cash-deposit.dto';

@Controller('cash-deposits')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class CashDepositsController {
  constructor(private readonly cashDepositsService: CashDepositsService) {}

  @Post()
  @Roles('agent', 'branch_manager', 'org_admin')
  @AuditAction('cash_deposit.create')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCashDepositDto) {
    return this.cashDepositsService.create(user.organizationId, user.id, dto);
  }

  @Get()
  @Roles('agent', 'branch_manager', 'org_admin')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: any) {
    return this.cashDepositsService.findAll(user.organizationId, query);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @Roles('branch_manager', 'org_admin')
  @AuditAction('cash_deposit.verify')
  async verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VerifyCashDepositDto,
  ) {
    return this.cashDepositsService.verify(user.organizationId, id, user.id, dto);
  }

  @Get('reconciliation')
  @Roles('branch_manager', 'org_admin')
  async getReconciliation(@CurrentUser() user: AuthenticatedUser) {
    return this.cashDepositsService.getReconciliation(user.organizationId);
  }
}
