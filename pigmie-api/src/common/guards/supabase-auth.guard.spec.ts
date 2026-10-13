jest.mock('../utils/jwks-verifier.util', () => ({
  verifySupabaseToken: jest.fn(),
}));
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ALLOW_FIRST_FACTOR_KEY } from '../decorators/allow-first-factor.decorator';
import { verifySupabaseToken } from '../utils/jwks-verifier.util';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../types/request-user.type';
import { Prisma } from '@prisma/client';

describe('Authenticated account resolution', () => {
  const providerSession = jest.fn();
  const staff = jest.fn();
  const customer = jest.fn();
  const identity = jest.fn();
  const guard = new SupabaseAuthGuard({
    $queryRaw: providerSession,
    staff: { findUnique: staff },
    customer: { findUnique: customer },
    runIdentity: identity,
  } as unknown as PrismaService);
  let request: { headers: { authorization?: string }; user?: RequestUser };
  let context: ExecutionContext;
  beforeEach(() => {
    jest.resetAllMocks();
    identity.mockImplementation(
      (_authId: string, operation: (tx: Prisma.TransactionClient) => unknown) =>
        operation({
          $queryRaw: providerSession,
          staff: { findUnique: staff },
          customer: { findUnique: customer },
        } as unknown as Prisma.TransactionClient),
    );
    request = { headers: { authorization: 'Bearer synthetic-token' } };
    context = {
      getHandler: () => () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    jest.mocked(verifySupabaseToken).mockResolvedValue({
      sub: '00000000-0000-4000-8000-000000000098',
      session_id: '00000000-0000-4000-8000-000000000099',
      role: 'authenticated',
      aal: 'aal2',
    });
    providerSession.mockResolvedValue([
      { active: true, hasVerifiedFactor: true },
    ]);
    staff.mockResolvedValue(null);
    customer.mockResolvedValue(null);
  });
  it('blocks an unlinked provisioning identity from ordinary onboarding', async () => {
    providerSession.mockResolvedValue([
      { active: true, hasVerifiedFactor: true, provisioningIdentity: true },
    ]);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Staff provisioning is incomplete',
    );
    expect(request.user).toBeUndefined();
  });
  it('preserves linked staff access even when provisioning metadata remains', async () => {
    providerSession.mockResolvedValue([
      { active: true, hasVerifiedFactor: true, provisioningIdentity: true },
    ]);
    staff.mockResolvedValue({
      id: 'staff',
      organizationId: 'org',
      role: 'agent',
      branchId: null,
      isActive: true,
    });
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user?.type).toBe('staff');
  });
  it('preserves linked portal access even when provisioning metadata remains', async () => {
    providerSession.mockResolvedValue([
      { active: true, hasVerifiedFactor: true, provisioningIdentity: true },
    ]);
    customer.mockResolvedValue({
      id: 'customer',
      organizationId: 'org',
      isActive: true,
      portalAccessEnabled: true,
    });
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user?.type).toBe('customer');
  });
  it('requires a bearer token before identity lookups', async () => {
    request.headers = {};
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(staff).not.toHaveBeenCalled();
  });
  it('rejects expired or invalid tokens', async () => {
    jest
      .mocked(verifySupabaseToken)
      .mockRejectedValue(new Error('Expired token'));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(staff).not.toHaveBeenCalled();
  });
  it.each([
    { role: 'authenticated' },
    { sub: '', role: 'authenticated' },
    { sub: 'user', role: 'anon' },
    { sub: 'user', role: 'service_role' },
  ])('rejects an invalid token identity %j', async (payload) => {
    jest.mocked(verifySupabaseToken).mockResolvedValue(payload);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(staff).not.toHaveBeenCalled();
  });
  it('does not reclassify disabled staff as customers or unprovisioned', async () => {
    staff.mockResolvedValue({ isActive: false });
    customer.mockResolvedValue({ isActive: true, portalAccessEnabled: true });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(customer).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });
  it.each([
    { isActive: false, portalAccessEnabled: true },
    { isActive: true, portalAccessEnabled: false },
  ])('denies disabled portal access %j', async (record) => {
    customer.mockResolvedValue(record);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });
  it('resolves active staff with server-owned role and branch', async () => {
    staff.mockResolvedValue({
      id: 'staff',
      organizationId: 'org',
      role: 'agent',
      branchId: 'branch',
      isActive: true,
    });
    await guard.canActivate(context);
    expect(request.user).toEqual({
      type: 'staff',
      id: 'staff',
      organizationId: 'org',
      role: 'agent',
      branchId: 'branch',
    });
  });
  it('resolves an enabled customer portal account', async () => {
    customer.mockResolvedValue({
      id: 'customer',
      organizationId: 'org',
      isActive: true,
      portalAccessEnabled: true,
    });
    await guard.canActivate(context);
    expect(request.user).toEqual({
      type: 'customer',
      id: 'customer',
      organizationId: 'org',
    });
  });
  it.each([undefined, 'aal1', 'unknown'])(
    'denies staff business access with assurance %s even when the custom flag is enabled',
    async (aal) => {
      staff.mockResolvedValue({
        id: 'staff',
        organizationId: 'org',
        role: 'org_admin',
        branchId: null,
        isActive: true,
        twoFactorEnabled: true,
      });
      jest.mocked(verifySupabaseToken).mockResolvedValue({
        sub: '00000000-0000-4000-8000-000000000098',
        session_id: '00000000-0000-4000-8000-000000000099',
        role: 'authenticated',
        aal,
      });
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(request.user).toBeUndefined();
      expect(customer).not.toHaveBeenCalled();
    },
  );
  it('allows explicitly annotated bootstrap for active staff at the first factor', async () => {
    staff.mockResolvedValue({
      id: 'staff',
      organizationId: 'org',
      role: 'agent',
      branchId: 'branch',
      isActive: true,
    });
    jest.mocked(verifySupabaseToken).mockResolvedValue({
      sub: '00000000-0000-4000-8000-000000000098',
      session_id: '00000000-0000-4000-8000-000000000099',
      role: 'authenticated',
      aal: 'aal1',
    });
    const handler = () => undefined;
    Reflect.defineMetadata(ALLOW_FIRST_FACTOR_KEY, true, handler);
    const bootstrap = {
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    expect(await guard.canActivate(bootstrap)).toBe(true);
    expect(request.user?.type).toBe('staff');
  });
  it('does not let a bootstrap annotation bypass disabled accounts', async () => {
    staff.mockResolvedValue({ isActive: false });
    const handler = () => undefined;
    Reflect.defineMetadata(ALLOW_FIRST_FACTOR_KEY, true, handler);
    const bootstrap = {
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(bootstrap)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('preserves onboarding for identities that have never been provisioned', async () => {
    await guard.canActivate(context);
    expect(request.user).toEqual({
      type: 'unprovisioned',
      authUserId: '00000000-0000-4000-8000-000000000098',
    });
  });
  it.each([undefined, '', 'forged-session'])(
    'rejects invalid session identifiers %s',
    async (session_id) => {
      jest.mocked(verifySupabaseToken).mockResolvedValue({
        sub: '00000000-0000-4000-8000-000000000098',
        role: 'authenticated',
        session_id,
      });
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(providerSession).not.toHaveBeenCalled();
      expect(staff).not.toHaveBeenCalled();
    },
  );
  it('rejects a revoked, missing, expired or banned provider session before resolving an actor', async () => {
    providerSession.mockResolvedValue([
      { active: false, hasVerifiedFactor: true },
    ]);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(staff).not.toHaveBeenCalled();
    expect(customer).not.toHaveBeenCalled();
  });
  it('fails closed with a generic availability error when provider session lookup fails', async () => {
    providerSession.mockRejectedValue(new Error('Synthetic provider failure'));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(staff).not.toHaveBeenCalled();
  });
  it('rejects stale second-factor access after every verified factor is removed', async () => {
    providerSession.mockResolvedValue([
      { active: true, hasVerifiedFactor: false },
    ]);
    staff.mockResolvedValue({ id: 'staff', isActive: true, role: 'org_admin' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request.user).toBeUndefined();
  });
});
