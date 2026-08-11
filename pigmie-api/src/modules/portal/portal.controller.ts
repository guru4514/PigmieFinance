import { Controller, Get, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/request-user.type';
import { PortalService } from './portal.service';

@Controller('portal')
@UseGuards(SupabaseAuthGuard)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getMe(user.organizationId, user.id);
  }

  @Get('loans')
  async getLoans(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getLoans(user.organizationId, user.id);
  }

  @Get('loans/:id')
  async getLoanDetails(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getLoanDetails(user.organizationId, user.id, id);
  }

  @Get('loans/:id/schedule')
  async getLoanSchedule(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getLoanSchedule(user.organizationId, user.id, id);
  }

  @Get('loans/:id/collections')
  async getLoanCollections(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'customer') throw new ForbiddenException('Portal access is for customers only');
    return this.portalService.getLoanCollections(user.organizationId, user.id, id);
  }
}


