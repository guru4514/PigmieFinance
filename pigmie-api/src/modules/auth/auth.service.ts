import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { RequestUser } from '../../common/types/request-user.type';
import { generateSecret, verify, generateURI } from 'otplib';
import { toDataURL } from 'qrcode';

const authenticator = {
  generateSecret,
  verify,
  keyuri: (label: string, issuer: string, secret: string) =>
    generateURI({ label, issuer, secret }),
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getMe(user: RequestUser) {
    if (user.type === 'unprovisioned') {
      return { userType: 'unprovisioned' };
    }

    if (user.type === 'staff') {
      const staff = await this.prisma.staff.findUnique({
        where: { id: user.id },
      });
      if (!staff) throw new NotFoundException('Staff not found');

      return {
        userType: 'staff',
        id: staff.id,
        organizationId: staff.organizationId,
        branchId: staff.branchId,
        fullName: staff.fullName,
        role: staff.role,
        twoFactorEnabled: staff.twoFactorEnabled,
      };
    }

    if (user.type === 'customer') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: user.id },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      const activeLoanCount = await this.prisma.loan.count({
        where: {
          customerId: customer.id,
          status: { in: ['pending_approval', 'approved', 'active'] },
        },
      });

      return {
        userType: 'customer',
        id: customer.id,
        organizationId: customer.organizationId,
        fullName: customer.fullName,
        activeLoanCount,
      };
    }
  }

  async setup2FA(staffId: string, organizationId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId, organizationId, isActive: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    if (staff.twoFactorEnabled)
      throw new BadRequestException('2FA is already enabled');

    const secret = authenticator.generateSecret();
    const encryptedSecret = `v1:${this.encryptionService.encrypt(secret).toString('base64')}`;
    const otpAuthUrl = authenticator.keyuri(
      staff.email || staffId,
      'PigmiePlatform',
      secret,
    );
    const qrCodeDataUrl = await toDataURL(otpAuthUrl, {
      width: 200,
      margin: 2,
    });

    const updated = await this.prisma.staff.updateMany({
      where: {
        id: staffId,
        organizationId,
        isActive: true,
        twoFactorEnabled: false,
        twoFactorSecret: staff.twoFactorSecret,
      },
      data: { twoFactorSecret: encryptedSecret },
    });
    if (updated.count !== 1)
      throw new BadRequestException('2FA configuration changed. Please retry.');

    return { secret, otpAuthUrl, qrCodeDataUrl };
  }

  async enable2FA(staffId: string, organizationId: string, code: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId, organizationId, isActive: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    if (staff.twoFactorEnabled)
      throw new BadRequestException('2FA is already enabled');

    if (!staff.twoFactorSecret) {
      throw new BadRequestException('2FA setup not initiated');
    }

    const isValid = await this.validCode(staff.twoFactorSecret, code);

    if (!isValid) throw new UnauthorizedException('Invalid 2FA code');

    const updated = await this.prisma.staff.updateMany({
      where: {
        id: staffId,
        organizationId,
        isActive: true,
        twoFactorEnabled: false,
        twoFactorSecret: staff.twoFactorSecret,
      },
      data: { twoFactorEnabled: true },
    });
    if (updated.count !== 1)
      throw new BadRequestException('2FA configuration changed. Please retry.');

    return { success: true };
  }

  async verify2FA(staffId: string, organizationId: string, code: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId, organizationId, isActive: true },
    });
    if (!staff || !staff.twoFactorEnabled) return { verified: false };

    if (!staff.twoFactorSecret) {
      return { verified: false };
    }

    const isValid = await this.validCode(staff.twoFactorSecret, code);

    return { verified: isValid };
  }

  async disable2FA(
    staffId: string,
    organizationId: string,
    targetStaffId?: string,
    code?: string,
    isAdminOverride?: boolean,
  ) {
    const targetId = targetStaffId || staffId;

    const targetStaff = await this.prisma.staff.findUnique({
      where: { id: targetId, organizationId, isActive: true },
    });
    if (!targetStaff) throw new NotFoundException('Staff not found');
    if (targetStaff.organizationId !== organizationId)
      throw new ForbiddenException(
        'Cannot disable 2FA for staff outside your organization',
      );

    if (!isAdminOverride) {
      if (targetId !== staffId)
        throw new ForbiddenException(
          'Cannot disable another staff member’s 2FA',
        );
      if (!code)
        throw new BadRequestException(
          'Code is required when disabling your own 2FA',
        );
      if (
        !targetStaff.twoFactorSecret ||
        !targetStaff.twoFactorEnabled ||
        !(await this.validCode(targetStaff.twoFactorSecret, code))
      )
        throw new UnauthorizedException('Invalid 2FA code');
    } else {
      const actor = await this.prisma.staff.findUnique({
        where: { id: staffId, organizationId, isActive: true },
      });
      if (actor?.role !== 'org_admin' || targetId === staffId)
        throw new ForbiddenException('Administrator override is not permitted');
    }

    const updated = await this.prisma.staff.updateMany({
      where: {
        id: targetId,
        organizationId,
        isActive: true,
        twoFactorEnabled: targetStaff.twoFactorEnabled,
        twoFactorSecret: targetStaff.twoFactorSecret,
      },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    if (updated.count !== 1)
      throw new BadRequestException('2FA configuration changed. Please retry.');

    return { success: true };
  }

  private async validCode(encrypted: string, code: string): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;
    try {
      const blob = encrypted.startsWith('v1:')
        ? Buffer.from(encrypted.slice(3), 'base64')
        : /^\\x[0-9a-f]+$/i.test(encrypted)
          ? Buffer.from(encrypted.slice(2), 'hex')
          : null;
      if (!blob || blob.length < 29) return false;
      const secret = this.encryptionService.decrypt(blob);
      const result = await authenticator.verify({ token: code, secret });
      return result.valid === true;
    } catch {
      return false;
    }
  }

  async logLoginEvent(user: RequestUser, req: Request) {
    if (user.type === 'unprovisioned') {
      return { success: true, logged: false, reason: 'unprovisioned' };
    }

    const ipAddress = this.extractClientIp(req);
    const userAgent =
      typeof req.headers?.['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;

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
    } catch {
      console.error('Failed to log login audit event');
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
