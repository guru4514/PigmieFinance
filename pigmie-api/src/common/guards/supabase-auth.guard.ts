import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { verifySupabaseToken } from '../utils/jwks-verifier.util';
import { RequestUser } from '../types/request-user.type';
import type { Request } from 'express';
import { ALLOW_FIRST_FACTOR_KEY } from '../decorators/allow-first-factor.decorator';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload;
    try {
      payload = await verifySupabaseToken(authHeader.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (
      typeof payload.sub !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        payload.sub,
      ) ||
      payload.role !== 'authenticated'
    ) {
      throw new UnauthorizedException('Invalid authenticated identity');
    }
    if (
      typeof payload.session_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        payload.session_id,
      )
    ) {
      throw new UnauthorizedException('Missing or invalid provider session');
    }
    const authUserId = payload.sub;
    let session:
      | {
          active: boolean;
          hasVerifiedFactor: boolean;
          provisioningIdentity: boolean;
        }
      | undefined;
    try {
      const sessions = await this.prisma.$queryRaw<
        {
          active: boolean;
          hasVerifiedFactor: boolean;
          provisioningIdentity: boolean;
        }[]
      >`
        SELECT EXISTS (
          SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id
          WHERE s.id = ${payload.session_id}::uuid AND s.user_id = ${authUserId}::uuid
            AND (s.not_after IS NULL OR s.not_after > now())
            AND (u.banned_until IS NULL OR u.banned_until <= now())
        ) AS active,
        EXISTS (
          SELECT 1 FROM auth.mfa_factors f
          WHERE f.user_id = ${authUserId}::uuid AND f.status = 'verified'
        ) AS "hasVerifiedFactor",
        EXISTS (
          SELECT 1 FROM auth.users u WHERE u.id = ${authUserId}::uuid
          AND u.raw_app_meta_data ? 'pigmie_provisioning_attempt'
        ) AS "provisioningIdentity"
      `;
      session = sessions[0];
    } catch {
      // Fail closed without exposing connection details or provider data.
      throw new ServiceUnavailableException(
        'Unable to validate authentication session',
      );
    }
    if (!session?.active) {
      throw new UnauthorizedException('Authentication session has ended');
    }
    const staff = await this.prisma.staff.findUnique({
      where: { authUserId },
      select: {
        id: true,
        organizationId: true,
        role: true,
        branchId: true,
        isActive: true,
      },
    });
    if (staff && !staff.isActive)
      throw new UnauthorizedException('Staff account is disabled');
    if (staff?.isActive) {
      const bootstrap: unknown = Reflect.getMetadata(
        ALLOW_FIRST_FACTOR_KEY,
        context.getHandler(),
      );
      if (
        (payload.aal !== 'aal2' || !session.hasVerifiedFactor) &&
        bootstrap !== true
      ) {
        throw new ForbiddenException({
          code: 'MFA_REQUIRED',
          message:
            'Verify your authenticator before accessing staff operations',
        });
      }
      request.user = {
        type: 'staff',
        id: staff.id,
        organizationId: staff.organizationId,
        role: staff.role,
        branchId: staff.branchId,
      };
      return true;
    }

    const customer = await this.prisma.customer.findUnique({
      where: { authUserId },
      select: {
        id: true,
        organizationId: true,
        isActive: true,
        portalAccessEnabled: true,
      },
    });
    if (customer && (!customer.isActive || !customer.portalAccessEnabled))
      throw new UnauthorizedException('Customer portal access is disabled');
    if (customer?.isActive && customer.portalAccessEnabled) {
      request.user = {
        type: 'customer',
        id: customer.id,
        organizationId: customer.organizationId,
      };
      return true;
    }

    if (session.provisioningIdentity)
      throw new UnauthorizedException('Staff provisioning is incomplete');
    request.user = { type: 'unprovisioned', authUserId };
    return true;
  }
}
