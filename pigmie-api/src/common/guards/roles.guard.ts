import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALLOW_ANY_ROLE_KEY } from '../decorators/allow-any-role.decorator';
import { ALLOW_UNPROVISIONED_KEY } from '../decorators/allow-unprovisioned.decorator';
import { StaffRole } from '../types/request-user.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    
    // Check if the route explicitly allows unprovisioned users
    const allowUnprovisioned = this.reflector.getAllAndOverride<boolean>(ALLOW_UNPROVISIONED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (user?.type === 'unprovisioned' && !allowUnprovisioned) {
      throw new UnauthorizedException('User account not provisioned');
    }

    // Check if the route explicitly allows any role (e.g. general auth endpoints)
    const allowAnyRole = this.reflector.getAllAndOverride<boolean>(ALLOW_ANY_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowAnyRole) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Default deny: if no @Roles() or @AllowAnyRole() is specified, block access.
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException('Endpoint lacks role configuration (Default Deny)');
    }

    if (user?.type !== 'staff' || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for this action');
    }
    return true;
  }
}
