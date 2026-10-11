import { Prisma } from '@prisma/client';
import { TenantPrismaService } from './tenant-prisma.service';
import { PrismaService } from './prisma.service';

it('sets the tenant inside the same transaction and forwards job-specific limits', async () => {
  const execute = jest
    .fn<Promise<number>, [TemplateStringsArray, string]>()
    .mockResolvedValue(1);
  const tx = { $executeRaw: execute } as unknown as Prisma.TransactionClient;
  const transaction = jest.fn(
    (
      callback: (client: Prisma.TransactionClient) => Promise<string>,
      options?: { timeout?: number },
    ) => {
      expect(options?.timeout).toBe(60000);
      return callback(tx);
    },
  );
  const service = new TenantPrismaService({
    $transaction: transaction,
  } as unknown as PrismaService);
  const callback = jest.fn(() => {
    expect(execute).toHaveBeenCalled();
    return Promise.resolve('saved');
  });
  expect(await service.run('synthetic-org', callback, { timeout: 60000 })).toBe(
    'saved',
  );
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
    timeout: 60000,
  });
  expect(callback).toHaveBeenCalledWith(tx);
  expect(execute.mock.calls[0][1]).toBe('synthetic-org');
});

describe('Opt-in atomic workflow transactions', () => {
  function harness() {
    const transaction = jest.fn(
      async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(1),
          id: transaction.mock.calls.length,
        } as unknown as Prisma.TransactionClient;
        return fn(tx);
      },
    );
    return {
      transaction,
      service: new TenantPrismaService({
        $transaction: transaction,
      } as unknown as PrismaService),
    };
  }
  it('uses one transaction for nested service writes and clears the context afterward', async () => {
    const { service, transaction } = harness();
    await service.runAtomic('org', async (outer) => {
      await service.run('org', (inner) => {
        expect(inner).toBe(outer);
        return Promise.resolve();
      });
      await service.runAtomic('org', (inner) => {
        expect(inner).toBe(outer);
        return Promise.resolve();
      });
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    await service.run('org', () => Promise.resolve(undefined));
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('rejects cross-tenant nested writes before their callback runs', async () => {
    const { service } = harness();
    const callback = jest.fn(() => Promise.resolve(undefined));
    await expect(
      service.runAtomic('org-a', () => service.run('org-b', callback)),
    ).rejects.toThrow('Cross-organization');
    expect(callback).not.toHaveBeenCalled();
  });
  it('isolates simultaneous workflow contexts', async () => {
    const { service, transaction } = harness();
    await Promise.all(
      ['org-a', 'org-b'].map((org) =>
        service.runAtomic(org, async (outer) => {
          await Promise.resolve();
          await service.run(org, (inner) => {
            expect(inner).toBe(outer);
            return Promise.resolve();
          });
        }),
      ),
    );
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('propagates a nested failure and does not reuse its context later', async () => {
    const { service, transaction } = harness();
    await expect(
      service.runAtomic('org', () =>
        service.run('org', () =>
          Promise.reject(new Error('Synthetic failure')),
        ),
      ),
    ).rejects.toThrow('Synthetic failure');
    await service.run('org', () => Promise.resolve(undefined));
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
