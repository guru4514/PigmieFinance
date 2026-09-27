jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  verify: jest.fn(),
  generateURI: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { Request } from 'express';
import { RequestUser } from '../../common/types/request-user.type';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      staff: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
      },
      loan: {
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: TenantPrismaService, useValue: {} },
        { provide: EncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('logLoginEvent', () => {
    it('should log a staff login event with action LOGIN and actorStaffId', async () => {
      const user: RequestUser = {
        type: 'staff',
        id: 'staff-uuid-1',
        organizationId: 'org-uuid-1',
        role: 'org_admin',
        branchId: 'branch-uuid-1',
      };

      const req = {
        headers: {
          'user-agent': 'Mozilla/5.0 TestBrowser',
        },
        ip: '192.168.1.100',
        socket: {},
      } as unknown as Request;

      prismaService.auditLog.create.mockResolvedValue({ id: 'audit-log-1' });

      const result = await service.logLoginEvent(user, req);

      expect(result).toEqual({ success: true, logged: true, id: 'audit-log-1' });
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-uuid-1',
          actorStaffId: 'staff-uuid-1',
          action: 'LOGIN',
          entityType: 'auth',
          entityId: 'staff-uuid-1',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 TestBrowser',
          newValue: expect.objectContaining({
            userId: 'staff-uuid-1',
            userType: 'staff',
            role: 'org_admin',
          }),
        }),
      });
    });

    it('should log a customer login event with actorStaffId null', async () => {
      const user: RequestUser = {
        type: 'customer',
        id: 'cust-uuid-1',
        organizationId: 'org-uuid-1',
      };

      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18',
          'user-agent': 'MobileApp/1.0',
        },
        ip: '127.0.0.1',
      } as unknown as Request;

      prismaService.auditLog.create.mockResolvedValue({ id: 'audit-log-2' });

      const result = await service.logLoginEvent(user, req);

      expect(result).toEqual({ success: true, logged: true, id: 'audit-log-2' });
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-uuid-1',
          actorStaffId: null,
          action: 'LOGIN',
          entityType: 'auth',
          entityId: 'cust-uuid-1',
          ipAddress: '203.0.113.195',
          userAgent: 'MobileApp/1.0',
          newValue: expect.objectContaining({
            userId: 'cust-uuid-1',
            userType: 'customer',
          }),
        }),
      });
    });

    it('should skip audit log creation for unprovisioned users', async () => {
      const user: RequestUser = {
        type: 'unprovisioned',
        authUserId: 'supabase-user-1',
      };

      const req = {} as Request;

      const result = await service.logLoginEvent(user, req);

      expect(result).toEqual({ success: true, logged: false, reason: 'unprovisioned' });
      expect(prismaService.auditLog.create).not.toHaveBeenCalled();
    });

    it('should gracefully handle errors when audit log creation fails', async () => {
      const user: RequestUser = {
        type: 'staff',
        id: 'staff-uuid-1',
        organizationId: 'org-uuid-1',
        role: 'agent',
        branchId: null,
      };

      const req = { headers: {} } as Request;

      prismaService.auditLog.create.mockRejectedValue(new Error('Database unavailable'));

      const result = await service.logLoginEvent(user, req);

      expect(result).toEqual({ success: true, logged: false });
    });
  });
});
