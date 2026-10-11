jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  verify: jest.fn(),
  generateURI: jest.fn(),
}));
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { verify, generateSecret, generateURI } from 'otplib';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { validate } from 'class-validator';
import { Enable2FADto } from './dto/enable-2fa.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Disable2FADto } from './dto/disable-2fa.dto';
import type { Prisma } from '@prisma/client';

describe('Custom TOTP validation and state transitions', () => {
  const blob = Buffer.alloc(40, 1);
  const staff = {
    id: 'staff',
    organizationId: 'org',
    isActive: true,
    email: 'synthetic@example.invalid',
    role: 'agent',
    twoFactorEnabled: false,
    twoFactorSecret: `v1:${blob.toString('base64')}`,
  };
  const findUnique = jest.fn();
  const updateMany = jest.fn<
    Promise<{ count: number }>,
    [Prisma.StaffUpdateManyArgs]
  >();
  const encrypt = jest.fn();
  const decrypt = jest.fn();
  const service = new AuthService(
    { staff: { findUnique, updateMany } } as unknown as PrismaService,
    {} as TenantPrismaService,
    { encrypt, decrypt } as unknown as EncryptionService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    findUnique.mockResolvedValue(staff);
    updateMany.mockResolvedValue({ count: 1 });
    decrypt.mockReturnValue('SYNTHETICSECRET');
    encrypt.mockReturnValue(blob);
    jest.mocked(verify).mockResolvedValue({ valid: false });
  });
  it('rejects an asynchronously returned invalid result without enabling 2FA', async () => {
    await expect(
      service.enable2FA('staff', 'org', '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('awaits validation before making a conditional update', async () => {
    let complete!: (result: {
      valid: true;
      delta: number;
      epoch: number;
    }) => void;
    jest.mocked(verify).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const operation = service.enable2FA('staff', 'org', '123456');
    await Promise.resolve();
    await Promise.resolve();
    expect(updateMany).not.toHaveBeenCalled();
    complete({ valid: true, delta: 0, epoch: 1 });
    await expect(operation).resolves.toEqual({ success: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'staff',
        organizationId: 'org',
        isActive: true,
        twoFactorEnabled: false,
        twoFactorSecret: staff.twoFactorSecret,
      },
      data: { twoFactorEnabled: true },
    });
  });
  it.each(['000000', '12345x', '1234567'])(
    'returns a boolean false for invalid code %s',
    async (code) => {
      findUnique.mockResolvedValue({ ...staff, twoFactorEnabled: true });
      expect(await service.verify2FA('staff', 'org', code)).toEqual({
        verified: false,
      });
    },
  );
  it('returns true only for a valid structured result', async () => {
    findUnique.mockResolvedValue({ ...staff, twoFactorEnabled: true });
    jest.mocked(verify).mockResolvedValue({ valid: true, delta: 0, epoch: 1 });
    expect(await service.verify2FA('staff', 'org', '123456')).toEqual({
      verified: true,
    });
  });
  it('fails closed when validation throws or secret decryption fails', async () => {
    findUnique.mockResolvedValue({ ...staff, twoFactorEnabled: true });
    jest.mocked(verify).mockRejectedValue(new Error('Provider failure'));
    expect(await service.verify2FA('staff', 'org', '123456')).toEqual({
      verified: false,
    });
    decrypt.mockImplementationOnce(() => {
      throw new Error('Corrupt ciphertext');
    });
    expect(await service.verify2FA('staff', 'org', '123456')).toEqual({
      verified: false,
    });
  });
  it('supports the legacy PostgreSQL hex ciphertext representation', async () => {
    findUnique.mockResolvedValue({
      ...staff,
      twoFactorEnabled: true,
      twoFactorSecret: `\\x${blob.toString('hex')}`,
    });
    await service.verify2FA('staff', 'org', '123456');
    expect(decrypt).toHaveBeenCalledWith(blob);
  });
  it('checks active staff and organization before accessing a secret', async () => {
    findUnique.mockResolvedValue(null);
    expect(await service.verify2FA('staff', 'other-org', '123456')).toEqual({
      verified: false,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'staff', organizationId: 'other-org', isActive: true },
    });
    expect(decrypt).not.toHaveBeenCalled();
  });
  it('reports a configuration race instead of claiming successful enablement', async () => {
    jest.mocked(verify).mockResolvedValue({ valid: true, delta: 0, epoch: 1 });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.enable2FA('staff', 'org', '123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('stores encrypted setup data in a versioned text format', async () => {
    jest.mocked(generateSecret).mockReturnValue('SYNTHETICSECRET');
    jest.mocked(generateURI).mockReturnValue('otpauth://synthetic');
    const result = await service.setup2FA('staff', 'org');
    expect(result.secret).toBe('SYNTHETICSECRET');
    expect(result.otpAuthUrl).toBe('otpauth://synthetic');
    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(
      Buffer.from(result.qrCodeDataUrl.split(',')[1], 'base64')
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { twoFactorSecret: staff.twoFactorSecret },
      }),
    );
  });
  it('never replaces an enabled secret', async () => {
    findUnique.mockResolvedValue({ ...staff, twoFactorEnabled: true });
    await expect(service.setup2FA('staff', 'org')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('rejects invalid self-disable and unauthorized administrator override', async () => {
    findUnique.mockResolvedValue({ ...staff, twoFactorEnabled: true });
    await expect(
      service.disable2FA('staff', 'org', undefined, '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.disable2FA('staff', 'org', 'other', undefined, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('clears enabled state and secret atomically after valid self-verification', async () => {
    findUnique.mockResolvedValue({ ...staff, twoFactorEnabled: true });
    jest.mocked(verify).mockResolvedValue({ valid: true, delta: 0, epoch: 1 });
    await service.disable2FA('staff', 'org', undefined, '123456');
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        twoFactorSecret: staff.twoFactorSecret,
        twoFactorEnabled: true,
      },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  });
  it.each([Enable2FADto, Verify2FADto, Disable2FADto])(
    'validates numeric OTP input at the boundary',
    async (Dto) => {
      const invalid = Object.assign(new Dto(), { code: '12345x' });
      expect(await validate(invalid)).not.toHaveLength(0);
      expect(
        await validate(Object.assign(new Dto(), { code: '012345' })),
      ).toHaveLength(0);
    },
  );
});
