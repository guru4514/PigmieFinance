import { Controller, Get, Post, Patch, Body, UseGuards, ConflictException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestUser } from '../../common/types/request-user.type';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuditAction } from '../../common/decorators/audit-action.decorator';

@Controller('organizations')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @AuditAction('organization.create')
  async createOrganization(@CurrentUser() user: RequestUser, @Body() dto: CreateOrganizationDto) {
    if (user.type !== 'unprovisioned') {
      throw new ConflictException('User is already provisioned');
    }
    return this.organizationsService.createOrganization(user.authUserId, dto);
  }

  @Get('me')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async getMyOrganization(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ConflictException('Only staff can access this endpoint');
    return this.organizationsService.getMyOrganization(user.organizationId);
  }

  @Patch('me')
  @Roles('org_admin')
  @AuditAction('organization.update')
  async updateOrganization(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationDto) {
    if (user.type !== 'staff') throw new ConflictException('Only staff can access this endpoint');
    return this.organizationsService.updateOrganization(user.organizationId, dto);
  }
}


