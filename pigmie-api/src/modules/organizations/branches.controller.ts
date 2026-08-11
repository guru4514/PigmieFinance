import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AuditAction } from '../../common/decorators/audit-action.decorator';

@Controller('branches')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async getBranches(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.organizationsService.getBranches(user.organizationId);
  }

  @Post()
  @Roles('org_admin')
  @AuditAction('branch.create')
  async createBranch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBranchDto) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.organizationsService.createBranch(user.organizationId, dto);
  }

  @Get(':id')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async getBranch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.organizationsService.getBranch(user.organizationId, id);
  }

  @Patch(':id')
  @Roles('org_admin')
  @AuditAction('branch.update')
  async updateBranch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.organizationsService.updateBranch(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Roles('org_admin')
  @AuditAction('branch.delete')
  async deleteBranch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (user.type !== 'staff') throw new ForbiddenException();
    return this.organizationsService.deleteBranch(user.organizationId, id);
  }
}


