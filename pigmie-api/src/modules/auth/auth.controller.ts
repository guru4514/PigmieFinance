import { Controller, Get, Post, Body, UseGuards, ForbiddenException, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser, RequestUser } from '../../common/types/request-user.type';
import { Enable2FADto } from './dto/enable-2fa.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Disable2FADto } from './dto/disable-2fa.dto';
import { AuditAction } from '../../common/decorators/audit-action.decorator';

@Controller('auth')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user);
  }

  @Post('login-event')
  @AuditAction('LOGIN')
  async recordLoginEvent(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.authService.logLoginEvent(user, req);
  }

  @Post('2fa/setup')
  @AuditAction('2fa.setup')
  async setup2FA(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can set up 2FA');
    return this.authService.setup2FA(user.id, user.organizationId);
  }

  @Post('2fa/enable')
  @AuditAction('2fa.enable')
  async enable2FA(@CurrentUser() user: AuthenticatedUser, @Body() dto: Enable2FADto) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can enable 2FA');
    return this.authService.enable2FA(user.id, user.organizationId, dto.code);
  }

  @Post('2fa/verify')
  async verify2FA(@CurrentUser() user: AuthenticatedUser, @Body() dto: Verify2FADto) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can verify 2FA');
    return this.authService.verify2FA(user.id, user.organizationId, dto.code);
  }

  @Post('2fa/disable')
  @AuditAction('2fa.disable')
  async disable2FA(@CurrentUser() user: AuthenticatedUser, @Body() dto: Disable2FADto) {
    if (user.type !== 'staff') throw new ForbiddenException('Only staff can disable 2FA');
    
    const isAdminOverride = user.role === 'org_admin' && !!dto.staffId && dto.staffId !== user.id;
    if (isAdminOverride) {
      return this.authService.disable2FA(user.id, user.organizationId, dto.staffId, undefined, true);
    }
    
    return this.authService.disable2FA(user.id, user.organizationId, user.id, dto.code, false);
  }
}


