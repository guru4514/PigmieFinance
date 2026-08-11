import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { AuditAction } from '../../common/decorators/audit-action.decorator';

@Controller('staff')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles('org_admin', 'branch_manager')
  async findAll(@Query() query: QueryStaffDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.staffService.findAll(user.organizationId, query, user.id, user.role === 'branch_manager');
  }

  @Get(':id')
  @Roles('org_admin', 'branch_manager')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.staffService.findOne(user.organizationId, id, user.id, user.role === 'branch_manager');
  }

  @Post()
  @Roles('org_admin')
  @AuditAction('staff.create')
  async create(@Body() dto: CreateStaffDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.staffService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  @AuditAction('staff.update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    
    // Only org_admin can do general updates.
    if (user.role === 'org_admin') {
      return this.staffService.update(user.organizationId, id, dto);
    }
    
    // Others can only patch their own phone
    if (user.id === id) {
      if (Object.keys(dto).some(key => key !== 'phone')) {
        throw new ForbiddenException('You can only update your phone number');
      }
      if (dto.phone) {
        return this.staffService.updateOwnPhone(user.organizationId, id, dto.phone);
      }
      return this.staffService.findOne(user.organizationId, id);
    }

    throw new ForbiddenException('You do not have permission to update this staff member');
  }

  @Delete(':id')
  @Roles('org_admin')
  @AuditAction('staff.delete')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.staffService.remove(user.organizationId, id);
  }
}


