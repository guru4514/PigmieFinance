import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { provisioningLockKey } from '../../common/utils/provisioning-lock.util';

export interface UnfinishedProvisioning {
  authUserId: string;
  attemptId: string;
  organizationId: string;
  createdAt: Date;
}

@Injectable()
export class ProvisioningReconciliationService {
  private readonly logger = new Logger(ProvisioningReconciliationService.name);
  constructor(private readonly prisma: PrismaService) {}

  async inspect(): Promise<UnfinishedProvisioning[]> {
    return this.eligible(this.prisma);
  }

  private async eligible(
    tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
    candidate?: UnfinishedProvisioning,
  ): Promise<UnfinishedProvisioning[]> {
    return tx.$queryRaw<UnfinishedProvisioning[]>(Prisma.sql`
      SELECT * FROM public.runtime_provisioning_candidates(
        ${candidate?.authUserId ?? null}::uuid,
        ${candidate?.attemptId ?? null}::uuid
      )
    `);
  }

  async reconcile() {
    const candidates = await this.inspect();
    const summary = {
      inspected: candidates.length,
      deleted: 0,
      skipped: 0,
      failed: 0,
    };
    if (!candidates.length) return summary;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error('Provisioning recovery provider is not configured');
    const provider = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    for (const candidate of candidates) {
      try {
        const deleted = await this.prisma.$transaction(
          async (tx) => {
            const lockKey = provisioningLockKey(candidate.attemptId);
            const locks = await tx.$queryRaw<
              { locked: boolean }[]
            >`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS locked`;
            if (!locks[0]?.locked) return false;
            const current = await this.eligible(tx, candidate);
            if (!current.length) return false;
            const result = await provider.auth.admin.deleteUser(
              candidate.authUserId,
            );
            if (result.error) throw new Error('Provider compensation failed');
            return true;
          },
          { timeout: 30000, maxWait: 10000 },
        );
        if (deleted) summary.deleted++;
        else summary.skipped++;
      } catch {
        summary.failed++;
      }
    }
    return summary;
  }

  @Cron('0 */15 * * * *', { waitForCompletion: true })
  async checkUnfinishedProvisioning() {
    try {
      if (process.env.PROVISIONING_AUTO_CLEANUP === 'true') {
        const summary = await this.reconcile();
        if (summary.inspected)
          this.logger.warn(
            `Provisioning recovery: ${summary.deleted} deleted, ${summary.skipped} skipped, ${summary.failed} failed`,
          );
        return;
      }
      const attempts = await this.inspect();
      if (attempts.length)
        this.logger.warn(
          `Unfinished staff provisioning requires review: ${attempts.length} candidate(s), report capped at 100`,
        );
    } catch {
      this.logger.error('Unable to inspect unfinished staff provisioning');
    }
  }
}
