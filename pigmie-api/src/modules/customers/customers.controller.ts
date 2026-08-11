import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { PortalAccessDto } from './dto/portal-access.dto';
import { ImportCustomersDto } from './dto/import-customers.dto';
import { BulkCreateCustomerDto } from './dto/customer.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { AuditAction } from '../../common/decorators/audit-action.decorator';

@Controller('customers')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findAll(@Query() query: QueryCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.findAll(user.organizationId, query, user.role, user.id);
  }

  @Post()
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  @AuditAction('customer.create')
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.create(user.organizationId, dto);
  }

  @Post('import')
  @Roles('org_admin')
  @AuditAction('customer.import')
  async importCustomers(@Body() dto: ImportCustomersDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.importCustomers(user.organizationId, dto);
  }

  @Post('bulk')
  @Roles('branch_manager', 'org_admin')
  @AuditAction('customer.bulk_create')
  async bulkCreate(@Body() dto: BulkCreateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.bulkCreate(user.organizationId, dto);
  }

  @Get(':id')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.findOne(user.organizationId, id, user.role, user.id);
  }

  @Patch(':id')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  @AuditAction('customer.update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.update(user.organizationId, id, dto, user.role, user.id);
  }

  @Delete(':id')
  @Roles('org_admin', 'branch_manager')
  @AuditAction('customer.delete')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.remove(user.organizationId, id);
  }

  @Get(':id/loans')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async findLoans(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.findLoans(user.organizationId, id);
  }

  @Post(':id/portal-access')
  @Roles('org_admin', 'branch_manager')
  @AuditAction('customer.grant_portal_access')
  async grantPortalAccess(
    @Param('id') id: string,
    @Body() dto: PortalAccessDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.grantPortalAccess(user.organizationId, id, dto);
  }

  @Delete(':id/portal-access')
  @Roles('org_admin', 'branch_manager')
  @AuditAction('customer.revoke_portal_access')
  async revokePortalAccess(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.customersService.revokePortalAccess(user.organizationId, id);
  }
}


