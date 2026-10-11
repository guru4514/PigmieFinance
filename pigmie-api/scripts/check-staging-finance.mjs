import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';

const config = parse(readFileSync(new URL('../.env.staging', import.meta.url)));
validateStaging(
  config,
  parse(readFileSync(new URL('../.env', import.meta.url))),
);
assert.equal(config.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
process.env.APP_ENV = 'staging';
process.env.DATABASE_URL = config.DATABASE_URL;
process.env.SUPABASE_URL = config.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = config.SUPABASE_SERVICE_ROLE_KEY;
const require = createRequire(import.meta.url);
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const {
  TenantPrismaService,
} = require('../dist/prisma/tenant-prisma.service.js');
const {
  CollectionsService,
} = require('../dist/modules/collections/collections.service.js');
const { LoansService } = require('../dist/modules/loans/loans.service.js');
const {
  ApprovalsService,
} = require('../dist/modules/approvals/approvals.service.js');
const { EmailService } = require('../dist/modules/email/email.service.js');
const {
  DocumentsService,
} = require('../dist/modules/documents/documents.service.js');
const { createClient } = require('@supabase/supabase-js');
const {
  CashDepositsService,
} = require('../dist/modules/cash-deposits/cash-deposits.service.js');
const {
  CustomersService,
} = require('../dist/modules/customers/customers.service.js');
const prisma = new PrismaService();
const tenant = new TenantPrismaService(prisma);
const email = new EmailService();
const collections = new CollectionsService(tenant, prisma, email);
const loans = new LoansService(tenant, {}, email);
const approvals = new ApprovalsService(tenant, {}, collections, loans);
const documents = new DocumentsService(tenant, { get: (key) => config[key] });
const storage = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  },
).storage;
let evidencePath;
const orgId = randomUUID();
let seeded = false;
let checkpoint = 'connect';
try {
  await prisma.$connect();
  checkpoint = 'synthetic fixture';
  const fixture = await prisma.$transaction(
    async (tx) => {
      await tx.organization.create({
        data: { id: orgId, name: `Synthetic stabilization ${orgId}` },
      });
      const agent = await tx.staff.create({
        data: {
          organizationId: orgId,
          authUserId: randomUUID(),
          fullName: 'Synthetic agent',
          email: 'synthetic@example.test',
          role: 'agent',
        },
      });
      const admin = await tx.staff.create({
        data: {
          organizationId: orgId,
          authUserId: randomUUID(),
          fullName: 'Synthetic admin',
          email: 'synthetic-admin@example.test',
          role: 'org_admin',
        },
      });
      const replacementAgent = await tx.staff.create({
        data: {
          organizationId: orgId,
          authUserId: randomUUID(),
          fullName: 'Synthetic replacement agent',
          email: 'synthetic-replacement@example.test',
          role: 'agent',
        },
      });
      const customer = await tx.customer.create({
        data: {
          organizationId: orgId,
          fullName: 'Synthetic customer',
          phone: 'synthetic-test-only',
          assignedAgentId: agent.id,
        },
      });
      const product = await tx.loanProduct.create({
        data: {
          organizationId: orgId,
          name: 'Synthetic product',
          interestType: 'flat',
          interestRateAnnual: 12,
          collectionFrequency: 'daily',
          minAmount: 1,
          maxAmount: 1000,
          minTenure: 1,
          maxTenure: 30,
        },
      });
      const makeLoan = async (code) => {
        const loan = await tx.loan.create({
          data: {
            organizationId: orgId,
            customerId: customer.id,
            loanProductId: product.id,
            loanCode: code,
            principalAmount: 100,
            interestType: 'flat',
            interestRateAnnual: 12,
            collectionFrequency: 'daily',
            tenure: 1,
            installmentAmount: 110,
            totalPayable: 110,
            outstandingBalance: 110,
            status: 'active',
            assignedAgentId: agent.id,
            startDate: new Date('2026-10-01'),
          },
        });
        await tx.loanSchedule.create({
          data: {
            loanId: loan.id,
            installmentNumber: 1,
            dueDate: new Date('2026-10-01'),
            principalComponent: 100,
            interestComponent: 10,
            dueAmount: 110,
          },
        });
        return loan;
      };
      return {
        agent,
        admin,
        replacementAgent,
        customer,
        paymentLoan: await makeLoan('SYNTHETIC-PAYMENT'),
        closureLoan: await makeLoan('SYNTHETIC-CLOSURE'),
        raceLoan: await makeLoan('SYNTHETIC-RACE'),
        recoveryLoan: await makeLoan('SYNTHETIC-DEFAULT-RECOVERY'),
      };
    },
    { timeout: 30000, maxWait: 10000 },
  );
  seeded = true;
  const payment = (loanId) => ({
    clientGeneratedId: randomUUID(),
    loanId,
    amount: 55,
    collectionDate: '2026-10-11',
    collectedAt: '2026-10-11T06:00:00Z',
    collectionMethod: 'cash',
  });
  checkpoint = 'required payment audit rollback';
  const failingTenant = {
    run: (organizationId, callback) =>
      tenant.run(organizationId, (tx) =>
        callback(
          new Proxy(tx, {
            get(target, property) {
              if (property === 'auditLog')
                return new Proxy(target.auditLog, {
                  get(delegate, key) {
                    if (key === 'create')
                      return async () => {
                        throw new Error('Synthetic audit failure');
                      };
                    const value = delegate[key];
                    return typeof value === 'function'
                      ? value.bind(delegate)
                      : value;
                  },
                });
              const value = target[property];
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }),
        ),
      ),
  };
  const failedCollections = new CollectionsService(
    failingTenant,
    prisma,
    email,
  );
  await assert.rejects(
    failedCollections.recordCollection(
      orgId,
      fixture.agent.id,
      payment(fixture.paymentLoan.id),
    ),
  );
  assert.equal(
    await prisma.collection.count({ where: { organizationId: orgId } }),
    0,
  );
  assert.equal(
    (
      await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.paymentLoan.id },
      })
    ).totalCollected.toString(),
    '0',
  );
  assert.equal(
    (
      await prisma.loanSchedule.findFirstOrThrow({
        where: { loanId: fixture.paymentLoan.id },
      })
    ).paidAmount.toString(),
    '0',
  );
  const failedHandovers = new CashDepositsService(failingTenant, prisma);
  await assert.rejects(
    failedHandovers.create(orgId, fixture.agent.id, {
      amount: 10,
      depositDate: '2026-10-11',
    }),
  );
  assert.equal(
    await prisma.cashDeposit.count({ where: { organizationId: orgId } }),
    0,
  );
  checkpoint = 'concurrent identical payment';
  const dto = payment(fixture.paymentLoan.id);
  const results = await Promise.all([
    collections.recordCollection(orgId, fixture.agent.id, dto),
    collections.recordCollection(orgId, fixture.agent.id, dto),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [
    'created',
    'duplicate',
  ]);
  assert.equal(
    await prisma.collection.count({ where: { organizationId: orgId } }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'collection.recorded' },
    }),
    1,
  );
  checkpoint = 'private collection evidence';
  const bucket = await storage.getBucket('collection-photos');
  assert.ok(
    !bucket.error && bucket.data?.public === false,
    'Private collection bucket must be configured before verification',
  );
  const entityId = results[0].collection.id;
  const evidenceDto = {
    relatedEntityType: 'collection',
    relatedEntityId: entityId,
    documentType: 'collection_photo',
    fileName: 'synthetic.png',
  };
  const grant = await documents.getUploadUrl(
    orgId,
    fixture.agent.id,
    evidenceDto,
  );
  evidencePath = grant.path;
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR7sAAAAASUVORK5CYII=',
    'base64',
  );
  const uploaded = await storage
    .from(grant.bucket)
    .uploadToSignedUrl(grant.path, grant.token, bytes, {
      contentType: 'image/png',
    });
  assert.equal(uploaded.error, null);
  const document = await documents.registerDocument(orgId, fixture.agent.id, {
    ...evidenceDto,
    filePath: grant.path,
  });
  const duplicate = await documents.registerDocument(orgId, fixture.agent.id, {
    ...evidenceDto,
    filePath: grant.path,
  });
  assert.equal(duplicate.id, document.id);
  await assert.rejects(
    documents.getSignedDownloadUrl(
      orgId,
      document.id,
      fixture.replacementAgent.id,
    ),
  );
  const authorized = await documents.getSignedDownloadUrl(
    orgId,
    document.id,
    fixture.agent.id,
  );
  assert.equal(
    (await fetch(authorized.signedUrl, { signal: AbortSignal.timeout(10000) }))
      .status,
    200,
  );
  const publicResponse = await fetch(
    `${config.SUPABASE_URL}/storage/v1/object/public/collection-photos/${evidencePath}`,
    { signal: AbortSignal.timeout(10000) },
  );
  assert.notEqual(publicResponse.status, 200);
  let actual = await prisma.loan.findUniqueOrThrow({
    where: { id: fixture.paymentLoan.id },
  });
  assert.equal(actual.totalCollected.toString(), '55');
  assert.equal(actual.outstandingBalance.toString(), '55');
  assert.equal(
    (
      await prisma.loanSchedule.findFirstOrThrow({
        where: { loanId: actual.id },
      })
    ).paidAmount.toString(),
    '55',
  );
  checkpoint = 'mismatched retry';
  await assert.rejects(
    collections.recordCollection(orgId, fixture.agent.id, {
      ...dto,
      amount: 54,
    }),
  );
  checkpoint = 'concurrent payment reversal';
  const collection = results[0].collection;
  const reversed = await Promise.allSettled([
    collections.reverseCollection(
      orgId,
      collection.id,
      fixture.admin.id,
      'Synthetic check',
    ),
    collections.reverseCollection(
      orgId,
      collection.id,
      fixture.admin.id,
      'Synthetic check',
    ),
  ]);
  assert.equal(
    reversed.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  actual = await prisma.loan.findUniqueOrThrow({
    where: { id: fixture.paymentLoan.id },
  });
  assert.equal(actual.totalCollected.toString(), '0');
  assert.equal(actual.outstandingBalance.toString(), '110');
  assert.equal(
    (
      await prisma.loanSchedule.findFirstOrThrow({
        where: { loanId: actual.id },
      })
    ).paidAmount.toString(),
    '0',
  );
  checkpoint = 'partial payment closure approval';
  await prisma.loan.update({
    where: { id: fixture.recoveryLoan.id },
    data: { status: 'defaulted' },
  });
  const recovery = await collections.recordCollection(
    orgId,
    fixture.agent.id,
    payment(fixture.recoveryLoan.id),
  );
  assert.equal(
    (
      await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.recoveryLoan.id },
      })
    ).status,
    'defaulted',
  );
  await collections.reverseCollection(
    orgId,
    recovery.collection.id,
    fixture.admin.id,
    'Synthetic recovery reversal',
  );
  const recoveredLoan = await prisma.loan.findUniqueOrThrow({
    where: { id: fixture.recoveryLoan.id },
  });
  assert.equal(recoveredLoan.status, 'defaulted');
  assert.equal(recoveredLoan.totalCollected.toString(), '0');
  assert.equal(recoveredLoan.outstandingBalance.toString(), '110');
  assert.equal(
    await prisma.auditLog.count({
      where: {
        organizationId: orgId,
        entityId: recovery.collection.id,
        action: 'collection.reversed',
      },
    }),
    1,
  );
  await collections.recordCollection(
    orgId,
    fixture.agent.id,
    payment(fixture.closureLoan.id),
  );
  const quote = await loans.getPreClosureDetails(orgId, fixture.closureLoan.id);
  assert.equal(quote.preClosurePenalty, 0);
  const request = await approvals.create(orgId, fixture.agent.id, {
    actionType: 'close_loan',
    entityType: 'loan',
    entityId: fixture.closureLoan.id,
    payload: { preClosureAmount: quote.preClosureAmount },
    reason: 'Synthetic check',
  });
  checkpoint = 'approval status failure rollback';
  const runAtomic = tenant.runAtomic.bind(tenant);
  tenant.runAtomic = (organization, callback) =>
    runAtomic(organization, (tx) =>
      callback(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'approvalRequest')
              return new Proxy(target.approvalRequest, {
                get(delegate, method) {
                  if (method === 'update')
                    return async () => {
                      throw new Error('Synthetic approval status failure');
                    };
                  return Reflect.get(delegate, method);
                },
              });
            return Reflect.get(target, key);
          },
        }),
      ),
    );
  try {
    await assert.rejects(
      approvals.approve(orgId, request.id, fixture.admin.id),
    );
  } finally {
    tenant.runAtomic = runAtomic;
  }
  actual = await prisma.loan.findUniqueOrThrow({
    where: { id: fixture.closureLoan.id },
  });
  assert.equal(actual.status, 'active');
  assert.equal(actual.totalCollected.toString(), '55');
  assert.equal(actual.outstandingBalance.toString(), '55');
  assert.equal(
    (
      await prisma.approvalRequest.findUniqueOrThrow({
        where: { id: request.id },
      })
    ).status,
    'pending',
  );
  assert.equal(
    await prisma.collection.count({ where: { loanId: actual.id } }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'loan.pre_closed' },
    }),
    0,
  );
  checkpoint = 'concurrent closure approval';
  const reviewed = await Promise.allSettled([
    approvals.approve(orgId, request.id, fixture.admin.id),
    approvals.approve(orgId, request.id, fixture.admin.id),
  ]);
  assert.equal(
    reviewed.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    (
      await prisma.approvalRequest.findUniqueOrThrow({
        where: { id: request.id },
      })
    ).status,
    'approved',
  );
  actual = await prisma.loan.findUniqueOrThrow({
    where: { id: fixture.closureLoan.id },
  });
  assert.equal(actual.status, 'closed');
  assert.equal(actual.outstandingBalance.toString(), '0');
  assert.ok(actual.totalPayable.equals(actual.totalCollected));
  const sum = await prisma.collection.aggregate({
    where: { loanId: actual.id, status: { in: ['recorded', 'verified'] } },
    _sum: { amount: true },
  });
  assert.ok(sum._sum.amount.equals(actual.totalCollected));
  checkpoint = 'direct client denial';
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.staff.count();
      }),
    );
  }
  checkpoint = 'customer reassignment versus payment lock ordering';
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const customerLocked = deferred();
  const releaseReassignment = deferred();
  const paymentWaiting = deferred();
  const monitoredTenant = (reassignment) => ({
    run: (organizationId, callback) =>
      tenant.run(
        organizationId,
        (tx) =>
          callback(
            new Proxy(tx, {
              get(target, property) {
                if (property !== '$executeRaw')
                  return Reflect.get(target, property);
                return async (...args) => {
                  const sql = args[0].join('');
                  if (!reassignment && sql.includes('FOR SHARE OF c'))
                    paymentWaiting.resolve();
                  const result = await Reflect.apply(
                    target.$executeRaw,
                    target,
                    args,
                  );
                  if (
                    reassignment &&
                    sql.includes('FROM customers') &&
                    sql.includes('FOR UPDATE')
                  ) {
                    customerLocked.resolve();
                    await releaseReassignment.promise;
                  }
                  return result;
                };
              },
            }),
          ),
        { timeout: 30000, maxWait: 10000 },
      ),
  });
  const customers = new CustomersService(monitoredTenant(true), {});
  const racingCollections = new CollectionsService(
    monitoredTenant(false),
    prisma,
    email,
  );
  const actor = {
    type: 'staff',
    id: fixture.admin.id,
    organizationId: orgId,
    role: 'org_admin',
    branchId: null,
  };
  const reassignment = customers.update(
    orgId,
    fixture.customer.id,
    { assignedAgentId: fixture.replacementAgent.id },
    actor,
  );
  // Attach rejection handlers immediately; never leave a blocked transaction behind on failure.
  const reassignmentOutcome = reassignment.then(
    () => ({ ok: true }),
    () => ({ ok: false }),
  );
  let paymentOutcome;
  try {
    await Promise.race([
      customerLocked.promise,
      reassignmentOutcome.then(() => {
        throw new Error('Reassignment did not acquire customer lock');
      }),
    ]);
    paymentOutcome = racingCollections
      .recordCollection(orgId, fixture.agent.id, payment(fixture.raceLoan.id))
      .then(
        () => ({ rejected: false }),
        (error) => ({ rejected: error?.getStatus?.() === 404 }),
      );
    await Promise.race([
      paymentWaiting.promise,
      paymentOutcome.then(() => {
        throw new Error('Payment did not reach customer lock');
      }),
    ]);
  } finally {
    releaseReassignment.resolve();
    await reassignmentOutcome;
    if (paymentOutcome) await paymentOutcome;
  }
  assert.equal((await reassignmentOutcome).ok, true);
  assert.equal((await paymentOutcome).rejected, true);
  assert.equal(
    await prisma.collection.count({ where: { loanId: fixture.raceLoan.id } }),
    0,
  );
  const raceLoan = await prisma.loan.findUniqueOrThrow({
    where: { id: fixture.raceLoan.id },
  });
  assert.equal(raceLoan.assignedAgentId, fixture.replacementAgent.id);
  assert.equal(raceLoan.totalCollected.toString(), '0');
  assert.equal(raceLoan.outstandingBalance.toString(), '110');
  checkpoint = 'owned retry after reassignment';
  assert.equal(
    (await collections.recordCollection(orgId, fixture.agent.id, dto)).status,
    'duplicate',
  );
  checkpoint = 'disabled customer updater';
  await prisma.staff.update({
    where: { id: fixture.admin.id },
    data: { isActive: false },
  });
  const ordinaryCustomers = new CustomersService(tenant, {});
  await assert.rejects(
    ordinaryCustomers.update(
      orgId,
      fixture.customer.id,
      { fullName: 'Must not be written' },
      actor,
    ),
    (error) => error?.getStatus?.() === 403,
  );
  assert.equal(
    (
      await prisma.customer.findUniqueOrThrow({
        where: { id: fixture.customer.id },
      })
    ).fullName,
    'Synthetic customer',
  );
  console.log(
    JSON.stringify({
      project: config.STAGING_PROJECT_REF,
      concurrentPayment: 'single posting',
      mismatchedRetry: 'rejected',
      concurrentReversal: 'single reversal',
      approvalFailure: 'settlement and audit rolled back',
      concurrentApproval: 'single settlement',
      loanScheduleAndReceiptTotals: 'reconciled',
      directClientReads: 'denied',
      requiredFinancialAuditFailure:
        'payment, schedule, totals and handover rolled back',
      privateEvidence:
        'owned signed upload/download, registration retry and unsigned denial verified',
      defaultedRecovery:
        'partial payment and reversal preserve defaulted classification',
      concurrentReassignment:
        'committed without deadlock; old agent payment denied; totals unchanged',
      reassignedOwnedRetry: 'acknowledged without another payment',
      disabledCustomerUpdater: 'denied with unchanged customer',
      data: 'synthetic only',
    }),
  );
} catch (error) {
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : 'CHECK_FAILED';
  console.error(
    `Staging financial check failed at ${checkpoint} (${code}); no credentials printed.`,
  );
  process.exitCode = 1;
} finally {
  if (seeded) {
    try {
      if (evidencePath) {
        const removed = await storage
          .from('collection-photos')
          .remove([evidencePath]);
        assert.equal(removed.error, null);
      }
      await prisma.$transaction(
        async (tx) => {
          await tx.document.deleteMany({ where: { organizationId: orgId } });
          await tx.cashDeposit.deleteMany({ where: { organizationId: orgId } });
          await tx.approvalRequest.deleteMany({
            where: { organizationId: orgId },
          });
          await tx.auditLog.deleteMany({ where: { organizationId: orgId } });
          await tx.collection.deleteMany({ where: { organizationId: orgId } });
          await tx.loanSchedule.deleteMany({
            where: { loan: { organizationId: orgId } },
          });
          await tx.loan.deleteMany({ where: { organizationId: orgId } });
          await tx.loanProduct.deleteMany({ where: { organizationId: orgId } });
          await tx.customer.deleteMany({ where: { organizationId: orgId } });
          await tx.staff.deleteMany({ where: { organizationId: orgId } });
          await tx.organization.delete({ where: { id: orgId } });
        },
        { timeout: 30000, maxWait: 10000 },
      );
      assert.equal(
        await prisma.organization.count({ where: { id: orgId } }),
        0,
      );
      console.log('Synthetic staging fixtures removed and cleanup verified.');
    } catch {
      console.error('Synthetic fixture cleanup needs attention.');
      process.exitCode = 1;
    }
  }
  await prisma.$disconnect();
}
