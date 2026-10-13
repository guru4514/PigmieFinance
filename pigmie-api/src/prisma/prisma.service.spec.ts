import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

const authId = '11111111-1111-4111-8111-111111111111';
const orgId = '22222222-2222-4222-8222-222222222222';

function harness() {
  const execute = jest
    .fn<Promise<number>, [TemplateStringsArray, ...string[]]>()
    .mockResolvedValue(1);
  const tx = { $executeRaw: execute } as unknown as Prisma.TransactionClient;
  const transaction = jest.fn(
    (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      callback(tx),
  );
  const disconnect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const end = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const service = Object.assign(
    Object.create(PrismaService.prototype) as object,
    {
      $transaction: transaction,
      $disconnect: disconnect,
      runtimePool: { end },
    },
  ) as unknown as PrismaService;
  return { service, execute, tx, transaction, disconnect, end };
}

describe('Runtime identity boundaries and cleanup', () => {
  it('sets identity locally and clears tenant and onboarding before lookup', async () => {
    const { service, execute, tx } = harness();
    const callback = jest.fn((client: Prisma.TransactionClient) => {
      expect(execute).toHaveBeenCalledTimes(1);
      expect(client).toBe(tx);
      return Promise.resolve('identity');
    });
    expect(await service.runIdentity(authId, callback)).toBe('identity');
    const query = execute.mock.calls[0][0].join('?');
    expect(query).toContain("set_config('app.current_org_id', '', true)");
    expect(query).toContain("set_config('app.onboarding_mode', '', true)");
    expect(execute.mock.calls[0][1]).toBe(authId);
  });

  it('binds onboarding to both supplied UUIDs within one transaction', async () => {
    const { service, execute, transaction, tx } = harness();
    await service.runOnboarding(authId, orgId, (client) => {
      expect(client).toBe(tx);
      expect(execute).toHaveBeenCalledTimes(1);
      return Promise.resolve();
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0].slice(1)).toEqual([authId, orgId]);
    expect(execute.mock.calls[0][0].join('?')).toContain(
      "set_config('app.onboarding_mode', '1', true)",
    );
  });

  it('rejects malformed identities before opening a transaction', async () => {
    const { service, transaction } = harness();
    const callback = jest.fn().mockResolvedValue(undefined);
    await expect(service.runIdentity('invalid', callback)).rejects.toThrow(
      'valid database context',
    );
    await expect(
      service.runOnboarding(authId, 'invalid', callback),
    ).rejects.toThrow('valid database context');
    expect(transaction).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('closes the external pool once when shutdown is requested twice', async () => {
    const { service, disconnect, end } = harness();
    await Promise.all([service.onModuleDestroy(), service.onModuleDestroy()]);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('closes the external pool even when client disconnection fails', async () => {
    const { service, disconnect, end } = harness();
    disconnect.mockRejectedValue(new Error('synthetic disconnect failure'));
    await expect(service.onModuleDestroy()).rejects.toThrow(
      'synthetic disconnect failure',
    );
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('sanitizes startup failure and remains safe to shut down again', async () => {
    const { service, disconnect, end } = harness();
    Object.assign(service, {
      $connect: jest
        .fn()
        .mockRejectedValue(new Error('synthetic private detail')),
    });
    await expect(service.onModuleInit()).rejects.toThrow(
      'Runtime database privileges could not be verified',
    );
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
