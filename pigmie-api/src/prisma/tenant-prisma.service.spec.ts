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
  const query = execute.mock.calls[0][0].join('?');
  expect(query).toContain("set_config('app.current_auth_id', '', true)");
  expect(query).toContain("set_config('app.onboarding_mode', '', true)");
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

describe('Bounded idempotent posting retries', () => {
  const timeout = () =>
    new Prisma.PrismaClientKnownRequestError('Synthetic transaction failure', {
      code: 'P2028',
      clientVersion: 'test',
    });
  function harness() {
    const transaction = jest.fn<
      Promise<string>,
      [(tx: Prisma.TransactionClient) => Promise<string>, unknown?]
    >();
    const service = new TenantPrismaService({
      $transaction: transaction,
    } as unknown as PrismaService);
    return { transaction, service };
  }
  it('starts one fresh transaction after rollback and keeps original limits', async () => {
    const { transaction, service } = harness();
    transaction
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce('duplicate');
    await expect(
      service.run('org', () => Promise.resolve('saved'), {
        retryIdempotent: true,
        timeout: 5000,
      }),
    ).resolves.toBe('duplicate');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[1][1]).toEqual({ timeout: 5000 });
  });
  it('stops after the second failure', async () => {
    const { transaction, service } = harness();
    transaction.mockRejectedValue(timeout());
    await expect(
      service.run('org', () => Promise.resolve('saved'), {
        retryIdempotent: true,
      }),
    ).rejects.toThrow('Synthetic');
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('does not retry ordinary mutations or validation failures', async () => {
    const { transaction, service } = harness();
    transaction
      .mockRejectedValueOnce(timeout())
      .mockRejectedValueOnce(new Error('Invalid input'));
    await expect(
      service.run('org', () => Promise.resolve('saved')),
    ).rejects.toThrow('Synthetic');
    await expect(
      service.run('org', () => Promise.resolve('saved'), {
        retryIdempotent: true,
      }),
    ).rejects.toThrow('Invalid input');
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('never replays a failed callback inside a shared atomic parent', async () => {
    const { transaction, service } = harness();
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    } as unknown as Prisma.TransactionClient;
    transaction.mockImplementation(async (fn) => fn(tx));
    const posting = jest.fn(() => Promise.reject(timeout()));
    await expect(
      service.runAtomic('org', () =>
        service.run('org', posting, { retryIdempotent: true }),
      ),
    ).rejects.toThrow('Synthetic');
    expect(posting).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
