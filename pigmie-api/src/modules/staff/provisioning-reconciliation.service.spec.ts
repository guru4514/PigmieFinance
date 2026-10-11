import { Logger } from '@nestjs/common';
import { ProvisioningReconciliationService } from './provisioning-reconciliation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

const deleteUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { deleteUser } } }),
}));

describe('Provisioning reconciliation warnings', () => {
  afterEach(() => jest.restoreAllMocks());
  it('logs counts without exposing candidate metadata', async () => {
    const service = new ProvisioningReconciliationService({
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { authUserId: 'synthetic-identity', attemptId: 'synthetic-attempt' },
        ]),
    } as unknown as PrismaService);
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await service.checkUnfinishedProvisioning();
    expect(warning).toHaveBeenCalledWith(
      'Unfinished staff provisioning requires review: 1 candidate(s), report capped at 100',
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      'synthetic-identity',
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      'synthetic-attempt',
    );
  });
  it('does not fabricate success or expose raw database errors', async () => {
    const service = new ProvisioningReconciliationService({
      $queryRaw: jest
        .fn()
        .mockRejectedValue(new Error('Synthetic private diagnostic')),
    } as unknown as PrismaService);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await service.checkUnfinishedProvisioning();
    expect(error).toHaveBeenCalledWith(
      'Unable to inspect unfinished staff provisioning',
    );
    expect(warning).not.toHaveBeenCalled();
  });
});

describe('Provisioning compensation', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
  });
  afterAll(() => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });
  function harness(locked = true, eligible = true) {
    deleteUser.mockReset().mockResolvedValue({ error: null });
    const candidate = {
      authUserId: 'synthetic-id',
      attemptId: 'synthetic-attempt',
      organizationId: 'synthetic-org',
      createdAt: new Date(0),
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ locked }])
        .mockResolvedValueOnce(eligible ? [candidate] : []),
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([candidate]),
      $transaction: (
        callback: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    };
    return new ProvisioningReconciliationService(
      prisma as unknown as PrismaService,
    );
  }
  it('skips an attempt whose creation/recovery lock is held', async () => {
    expect(await harness(false).reconcile()).toEqual({
      inspected: 1,
      deleted: 0,
      skipped: 1,
      failed: 0,
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('preserves an identity linked or changed after the initial report', async () => {
    expect(await harness(true, false).reconcile()).toEqual({
      inspected: 1,
      deleted: 0,
      skipped: 1,
      failed: 0,
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it('compensates only the rechecked identity', async () => {
    expect(await harness().reconcile()).toEqual({
      inspected: 1,
      deleted: 1,
      skipped: 0,
      failed: 0,
    });
    expect(deleteUser).toHaveBeenCalledWith('synthetic-id');
  });
  it('records provider failure without exposing diagnostics or claiming deletion', async () => {
    const service = harness();
    deleteUser.mockRejectedValue(
      new Error('Synthetic private provider failure'),
    );
    expect(await service.reconcile()).toEqual({
      inspected: 1,
      deleted: 0,
      skipped: 0,
      failed: 1,
    });
  });
});
