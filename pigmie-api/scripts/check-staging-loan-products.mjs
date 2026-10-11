import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

const config = parse(readFileSync(new URL('../.env.staging', import.meta.url)));
validateStaging(
  config,
  parse(readFileSync(new URL('../.env', import.meta.url))),
);
assert.equal(config.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
process.env.APP_ENV = 'staging';
process.env.DATABASE_URL = config.DATABASE_URL;
const require = createRequire(import.meta.url);
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const {
  TenantPrismaService,
} = require('../dist/prisma/tenant-prisma.service.js');
const {
  LoanProductsService,
} = require('../dist/modules/loan-products/loan-products.service.js');
const prisma = new PrismaService();
const lockProbePool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
const tenant = new TenantPrismaService(prisma);
const service = new LoanProductsService(tenant);
const orgId = randomUUID();
const staffId = randomUUID();
let seeded = false;
let checkpoint = 'connect';
const dto = {
  name: 'Synthetic lock verification',
  interestType: 'flat',
  interestRateAnnual: 12,
  collectionFrequency: 'monthly',
  minAmount: 100,
  maxAmount: 1000,
  minTenure: 1,
  maxTenure: 12,
};
try {
  await prisma.$connect();
  checkpoint = 'fixture';
  await prisma.$transaction(async (tx) => {
    await tx.organization.create({
      data: { id: orgId, name: 'Synthetic product locks' },
    });
    await tx.staff.create({
      data: {
        id: staffId,
        organizationId: orgId,
        authUserId: randomUUID(),
        fullName: 'Synthetic administrator',
        email: 'product-locks@example.test',
        role: 'org_admin',
      },
    });
  });
  seeded = true;
  const product = await service.create(orgId, dto, staffId);

  checkpoint = 'administrator lock';
  await tenant.runAtomic(orgId, async () => {
    await service.update(
      orgId,
      product.id,
      { name: 'Synthetic updated' },
      staffId,
    );
    // A separate transaction must not demote an actor while their mutation is open.
    await assert.rejects(
      (async () => {
        const client = await lockProbePool.connect();
        try {
          await client.query('BEGIN');
          await client.query("SET LOCAL lock_timeout = '250ms'");
          await client.query(
            "UPDATE staff SET role = 'agent' WHERE id = $1::uuid AND organization_id = $2::uuid",
            [staffId, orgId],
          );
        } finally {
          try {
            await client.query('ROLLBACK');
          } finally {
            client.release();
          }
        }
      })(),
      (error) => error?.code === '55P03',
    );
  });
  assert.equal(
    (await prisma.staff.findUnique({ where: { id: staffId } })).role,
    'org_admin',
  );

  checkpoint = 'overlapping product limits';
  const results = await Promise.allSettled([
    service.update(orgId, product.id, { minAmount: 800 }, staffId),
    service.update(orgId, product.id, { maxAmount: 500 }, staffId),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.getStatus(), 400);
  const finalProduct = await prisma.loanProduct.findUnique({
    where: { id: product.id },
  });
  assert.ok(finalProduct.minAmount.lte(finalProduct.maxAmount));

  checkpoint = 'revoked administrator';
  await prisma.staff.update({
    where: { id: staffId },
    data: { role: 'agent' },
  });
  for (const action of [
    () => service.create(orgId, dto, staffId),
    () => service.update(orgId, product.id, { name: 'Denied' }, staffId),
    () => service.remove(orgId, product.id, staffId),
  ])
    await assert.rejects(action(), (error) => error.getStatus?.() === 403);
  assert.equal(
    await prisma.loanProduct.count({ where: { organizationId: orgId } }),
    1,
  );
  assert.equal(
    (await prisma.loanProduct.findUnique({ where: { id: product.id } }))
      .isActive,
    true,
  );
  console.log(
    'Staging product checks passed: actor lock, concurrent bounds, revoked actor denied on all mutations.',
  );
} catch (error) {
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : 'CHECK_FAILED';
  console.error(
    `Product staging check failed at ${checkpoint} (${code}); no credentials or provider response printed.`,
  );
  process.exitCode = 1;
} finally {
  if (seeded) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.loanProduct.deleteMany({ where: { organizationId: orgId } });
        await tx.staff.deleteMany({ where: { organizationId: orgId } });
        await tx.organization.delete({ where: { id: orgId } });
      });
      assert.equal(
        await prisma.organization.count({ where: { id: orgId } }),
        0,
      );
      console.log('Synthetic product fixtures removed and cleanup verified.');
    } catch {
      console.error('Synthetic product fixture cleanup needs attention.');
      process.exitCode = 1;
    }
  }
  await prisma.$disconnect();
  await lockProbePool.end();
}
