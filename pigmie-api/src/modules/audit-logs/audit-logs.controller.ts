import { Controller, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/audit-log.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';

@Controller('audit-logs')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles('org_admin')
  async findAll(@Query() query: QueryAuditLogsDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can access this endpoint');
    return this.auditLogsService.findAll(user.organizationId, query);
  }
}
