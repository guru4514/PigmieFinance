import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AllowAnyRole } from '../decorators/allow-any-role.decorator';
import { AllowUnprovisioned } from '../decorators/allow-unprovisioned.decorator';
import { Roles } from '../decorators/roles.decorator';
import { RequestUser } from '../types/request-user.type';

describe('Role guard default deny', () => {
  const guard = new RolesGuard(new Reflector());
  function context(controller: new () => object, user?: RequestUser) {
    return {
      getClass: () => controller,
      getHandler: () => function handler() {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }
  it('requires authentication even when any role is allowed', () => {
    @AllowAnyRole()
    class Controller {}
    expect(() => guard.canActivate(context(Controller))).toThrow(
      UnauthorizedException,
    );
  });
  it('only allows unprovisioned identities on explicit onboarding routes', () => {
    @AllowAnyRole()
    class Denied {}
    @AllowAnyRole()
    @AllowUnprovisioned()
    class Allowed {}
    const user: RequestUser = { type: 'unprovisioned', authUserId: 'auth' };
    expect(() => guard.canActivate(context(Denied, user))).toThrow(
      UnauthorizedException,
    );
    expect(guard.canActivate(context(Allowed, user))).toBe(true);
  });
  it('denies routes without an explicit role policy', () => {
    class Controller {}
    expect(() =>
      guard.canActivate(
        context(Controller, {
          type: 'customer',
          id: 'customer',
          organizationId: 'org',
        }),
      ),
    ).toThrow(ForbiddenException);
  });
  it('denies customer identities on staff routes and preserves legitimate staff access', () => {
    @Roles('agent')
    class Controller {}
    expect(() =>
      guard.canActivate(
        context(Controller, {
          type: 'customer',
          id: 'customer',
          organizationId: 'org',
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        context(Controller, {
          type: 'staff',
          id: 'staff',
          organizationId: 'org',
          role: 'agent',
          branchId: null,
        }),
      ),
    ).toBe(true);
  });
});
