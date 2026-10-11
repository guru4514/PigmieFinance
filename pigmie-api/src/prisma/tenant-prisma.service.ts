import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class TenantPrismaService {
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
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    const context = this.atomicContext.getStore();
    if (context) {
      if (context.organizationId !== organizationId)
        throw new Error('Cross-organization nested transaction is forbidden');
      return fn(context.tx);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
      return fn(tx);
    }, options);
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
