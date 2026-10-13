import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  runtimeDatabaseConfiguration,
  assertRuntimePrivileges,
} from './runtime-database.util';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly runtimePool: Pool;
  private shutdown: Promise<void> | undefined;
  constructor() {
    const pool = new Pool(runtimeDatabaseConfiguration(process.env));
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.runtimePool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      const rows = await this.$queryRaw<
        {
          role: string;
          superuser: boolean;
          bypass: boolean;
          createRole: boolean;
          createDatabase: boolean;
          owner: boolean;
          inherited: boolean;
          member: boolean;
        }[]
      >`
        SELECT current_user::text AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass,
          r.rolcreaterole AS "createRole", r.rolcreatedb AS "createDatabase", r.rolinherit AS inherited,
          EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS member,
          EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relowner=r.oid) AS owner
        FROM pg_roles r WHERE r.rolname=current_user`;
      if (rows.length !== 1) throw new Error();
      assertRuntimePrivileges(rows[0]);
    } catch {
      await this.onModuleDestroy().catch(() => undefined);
      throw new Error('Runtime database privileges could not be verified');
    }
  }

  async runIdentity<T>(
    authUserId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    this.requireUuid(authUserId);
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_auth_id', ${authUserId}, true), set_config('app.current_org_id', '', true), set_config('app.onboarding_mode', '', true)`;
      return operation(tx);
    });
  }

  async runOnboarding<T>(
    authUserId: string,
    organizationId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    this.requireUuid(authUserId);
    this.requireUuid(organizationId);
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_auth_id', ${authUserId}, true), set_config('app.current_org_id', ${organizationId}, true), set_config('app.onboarding_mode', '1', true)`;
      return operation(tx);
    });
  }

  private requireUuid(value: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      throw new Error('A valid database context identity is required');
  }

  onModuleDestroy(): Promise<void> {
    this.shutdown ??= (async () => {
      try {
        await this.$disconnect();
      } finally {
        await this.runtimePool.end();
      }
    })();
    return this.shutdown;
  }
}
