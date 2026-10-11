import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class TenantPrismaService {
  private readonly logger = new Logger(TenantPrismaService.name);
  private readonly atomicContext = new AsyncLocalStorage<{
    organizationId: string;
    tx: Prisma.TransactionClient;
  }>();
  constructor(private prisma: PrismaService) {}

  /**
   * Sets organization context inside the transaction for database policies.
   * Roles that bypass RLS still require explicit tenant predicates and access checks.
   */
  async run<T>(
    organizationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
      /** Only for database-only callbacks protected by a durable idempotency key. */
      retryIdempotent?: boolean;
    },
  ): Promise<T> {
    const context = this.atomicContext.getStore();
    if (context) {
      if (context.organizationId !== organizationId)
        throw new Error('Cross-organization nested transaction is forbidden');
      return fn(context.tx);
    }
    const { retryIdempotent, ...limits } = options ?? {};
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
            return fn(tx);
          },
          options ? limits : undefined,
        );
      } catch (error) {
        // $transaction has finished/rolled back before a fresh transaction is
        // opened. Shared atomic contexts return above and must never retry here.
        if (
          !retryIdempotent ||
          attempt >= 1 ||
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2028', 'P2034'].includes(error.code)
        )
          throw error;
        this.logger.warn('Retrying an idempotent database transaction once');
        await new Promise((done) => setTimeout(done, 100));
      }
    }
  }

  /** Opt-in sharing for workflows whose nested service writes must commit together. */
  async runAtomic<T>(
    organizationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.run(organizationId, (tx) =>
      this.atomicContext.run({ organizationId, tx }, () => fn(tx)),
    );
  }
}
