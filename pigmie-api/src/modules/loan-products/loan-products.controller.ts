import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, ForbiddenException } from '@nestjs/common';
import { LoanProductsService } from './loan-products.service';
import { CreateLoanProductDto } from './dto/create-loan-product.dto';
import { UpdateLoanProductDto } from './dto/update-loan-product.dto';
import { QueryLoanProductDto } from './dto/query-loan-product.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';

@Controller('loan-products')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class LoanProductsController {
  constructor(private readonly loanProductsService: LoanProductsService) {}

  @Post()
  @Roles('org_admin')
  @AuditAction('loan_product.create')
  async create(@Body() createLoanProductDto: CreateLoanProductDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.loanProductsService.create(user.organizationId, createLoanProductDto, user.id);
  }

  @Get()
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findAll(@Query() query: QueryLoanProductDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.loanProductsService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.loanProductsService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @Roles('org_admin')
  @AuditAction('loan_product.update')
  async update(@Param('id') id: string, @Body() updateLoanProductDto: UpdateLoanProductDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.loanProductsService.update(user.organizationId, id, updateLoanProductDto, user.id);
  }

  @Delete(':id')
  @Roles('org_admin')
  @AuditAction('loan_product.delete')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.loanProductsService.remove(user.organizationId, id, user.id);
  }
}


