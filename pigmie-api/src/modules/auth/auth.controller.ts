import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
  Req,
  GoneException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AuthenticatedUser,
  RequestUser,
} from '../../common/types/request-user.type';
import { Disable2FADto } from './dto/disable-2fa.dto';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { AllowAnyRole } from '../../common/decorators/allow-any-role.decorator';
import { AllowUnprovisioned } from '../../common/decorators/allow-unprovisioned.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AllowFirstFactor } from '../../common/decorators/allow-first-factor.decorator';

@Controller('auth')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @AllowFirstFactor()
  @AllowAnyRole()
  @AllowUnprovisioned()
  async getMe(@CurrentUser() user: RequestUser) {
    return this.authService.getMe(user);
  }

  @Post('login-event')
  @AllowFirstFactor()
  @AuditAction('LOGIN')
  @AllowAnyRole()
  @AllowUnprovisioned()
  async recordLoginEvent(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.authService.logLoginEvent(user, req);
  }

  @Post('2fa/setup')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @AuditAction('2fa.setup')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  setup2FA(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff')
      throw new ForbiddenException('Only staff can set up 2FA');
    throw new GoneException(
      'Custom MFA enrollment is retired. Use the Supabase authenticator enrollment flow',
    );
  }

  @Post('2fa/enable')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @AuditAction('2fa.enable')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  enable2FA(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff')
      throw new ForbiddenException('Only staff can enable 2FA');
    throw new GoneException(
      'Custom MFA is retired. Verify a Supabase authenticator challenge',
    );
  }

  @Post('2fa/verify')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  verify2FA(@CurrentUser() user: AuthenticatedUser) {
    if (user.type !== 'staff')
      throw new ForbiddenException('Only staff can verify 2FA');
    throw new GoneException(
      'Custom MFA cannot authorize a staff session. Verify a Supabase authenticator challenge',
    );
  }

  @Post('2fa/disable')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @AuditAction('2fa.disable')
  @Roles('org_admin', 'branch_manager', 'agent', 'accountant')
  async disable2FA(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Disable2FADto,
  ) {
    if (user.type !== 'staff')
      throw new ForbiddenException('Only staff can disable 2FA');

    const isAdminOverride =
      user.role === 'org_admin' && !!dto.staffId && dto.staffId !== user.id;
    if (isAdminOverride) {
      return this.authService.disable2FA(
        user.id,
        user.organizationId,
        dto.staffId,
        undefined,
        true,
      );
    }

    return this.authService.disable2FA(
      user.id,
      user.organizationId,
      user.id,
      dto.code,
      false,
    );
  }
}
