import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { RequestUser } from '../../common/types/request-user.type';
import { generateSecret, verify, generateURI } from 'otplib';

const authenticator = {
  generateSecret,
  verify,
  keyuri: (label: string, issuer: string, secret: string) => generateURI({ label, issuer, secret })
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly encryptionService: EncryptionService
  ) {}

  async getMe(user: RequestUser) {
    if (user.type === 'unprovisioned') {
      return { userType: 'unprovisioned' };
    }

    if (user.type === 'staff') {
      const staff = await this.prisma.staff.findUnique({
        where: { id: user.id }
      });
      if (!staff) throw new NotFoundException('Staff not found');
      
      return {
        userType: 'staff',
        id: staff.id,
        organizationId: staff.organizationId,
        branchId: staff.branchId,
        fullName: staff.fullName,
        role: staff.role,
        twoFactorEnabled: staff.twoFactorEnabled
      };
    }

    if (user.type === 'customer') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: user.id }
      });
      if (!customer) throw new NotFoundException('Customer not found');

      const activeLoanCount = await this.prisma.loan.count({
        where: { 
          customerId: customer.id,
          status: { in: ['pending_approval', 'approved', 'active'] } 
        }
      });

      return {
        userType: 'customer',
        id: customer.id,
        organizationId: customer.organizationId,
        fullName: customer.fullName,
        activeLoanCount
      };
    }
  }

  async setup2FA(staffId: string, organizationId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff not found');
    if (staff.twoFactorEnabled) throw new BadRequestException('2FA is already enabled');

    const secret = authenticator.generateSecret();
    const encryptedSecret = this.encryptionService.encrypt(secret);

    // Save encrypted secret using raw query to bypass schema limits if two_factor_secret isn't generated in Prisma
    await this.prisma.$executeRaw`UPDATE "Staff" SET "two_factor_secret" = ${encryptedSecret} WHERE id = ${staffId}::uuid`;

    const otpAuthUrl = authenticator.keyuri(staff.email || staffId, 'PigmiePlatform', secret);

    return { secret, otpAuthUrl };
  }

  async enable2FA(staffId: string, organizationId: string, code: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff not found');
    if (staff.twoFactorEnabled) throw new BadRequestException('2FA is already enabled');

    const result: any = await this.prisma.$queryRaw`SELECT "two_factor_secret" FROM "Staff" WHERE id = ${staffId}::uuid`;
    if (!result || result.length === 0 || !result[0].two_factor_secret) {
      throw new BadRequestException('2FA setup not initiated');
    }

    const secret = this.encryptionService.decrypt(result[0].two_factor_secret);
    const isValid = authenticator.verify({ token: code, secret });

    if (!isValid) throw new UnauthorizedException('Invalid 2FA code');

    await this.prisma.staff.update({
      where: { id: staffId },
      data: { twoFactorEnabled: true }
    });

    return { success: true };
  }

  async verify2FA(staffId: string, organizationId: string, code: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff || !staff.twoFactorEnabled) return { verified: false };

    const result: any = await this.prisma.$queryRaw`SELECT "two_factor_secret" FROM "Staff" WHERE id = ${staffId}::uuid`;
    if (!result || result.length === 0 || !result[0].two_factor_secret) {
      return { verified: false };
    }

    const secret = this.encryptionService.decrypt(result[0].two_factor_secret);
    const isValid = authenticator.verify({ token: code, secret });

    return { verified: isValid };
  }

  async disable2FA(staffId: string, organizationId: string, targetStaffId?: string, code?: string, isAdminOverride?: boolean) {
    const targetId = targetStaffId || staffId;
    
    if (!isAdminOverride) {
      if (!code) throw new BadRequestException('Code is required when disabling your own 2FA');
      const verifyResult = await this.verify2FA(targetId, organizationId, code);
      if (!verifyResult.verified) throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.prisma.staff.update({
      where: { id: targetId },
      data: { twoFactorEnabled: false }
    });

    await this.prisma.$executeRaw`UPDATE "Staff" SET "two_factor_secret" = NULL WHERE id = ${targetId}::uuid`;

    return { success: true };
  }

  async logLoginEvent(user: RequestUser, req: Request) {
    if (user.type === 'unprovisioned') {
      return { success: true, logged: false, reason: 'unprovisioned' };
    }

    const ipAddress = this.extractClientIp(req);
    const userAgent = typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    try {
      const auditLog = await this.prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorStaffId: user.type === 'staff' ? user.id : null,
          action: 'LOGIN',
          entityType: 'auth',
          entityId: user.id,
          ipAddress,
          userAgent,
          newValue: {
            userId: user.id,
            userType: user.type,
            timestamp: new Date().toISOString(),
            ...(user.type === 'staff' ? { role: user.role } : {}),
          },
        },
      });

      return { success: true, logged: true, id: auditLog.id };
    } catch (error) {
      console.error('Failed to log login audit event:', error);
      return { success: true, logged: false };
    }
  }

  private extractClientIp(req: Request): string | null {
    if (!req) return null;
    const forwarded = req.headers?.['x-forwarded-for'];
    let ip: string | undefined;

    if (typeof forwarded === 'string') {
      ip = forwarded.split(',')[0].trim();
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      ip = forwarded[0].split(',')[0].trim();
    } else {
      ip = req.ip || req.socket?.remoteAddress;
    }

    if (!ip) return null;

    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }

    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;

    if (ipv4Regex.test(ip) || ipv6Regex.test(ip) || ip === '::1') {
      return ip;
    }

    return null;
  }
}

