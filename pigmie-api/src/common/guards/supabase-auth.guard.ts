import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { verifySupabaseToken } from '../utils/jwks-verifier.util';
import { RequestUser } from '../types/request-user.type';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
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

    const authUserId = payload.sub as string;
    const staff = await this.prisma.staff.findUnique({ where: { authUserId } });
    if (staff?.isActive) {
      request.user = { 
        type: 'staff', 
        id: staff.id, 
        organizationId: staff.organizationId, 
        role: staff.role,
        branchId: staff.branchId
      } as RequestUser;
      return true;
    }

    const customer = await this.prisma.customer.findUnique({ where: { authUserId } });
    if (customer?.isActive && customer.portalAccessEnabled) {
      request.user = { 
        type: 'customer', 
        id: customer.id, 
        organizationId: customer.organizationId 
      } as RequestUser;
      return true;
    }

    request.user = { type: 'unprovisioned', authUserId } as RequestUser;
    return true;
  }
}
