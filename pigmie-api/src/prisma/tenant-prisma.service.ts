import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TenantPrismaService {
  constructor(private prisma: PrismaService) {}

  /**
   * Runs `fn` inside a transaction whose Postgres session is scoped to
   * `organizationId`, so RLS policies apply to every query fn makes.
   */
  async run<T>(organizationId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
      return fn(tx);
    });
  }
}
