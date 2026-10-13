import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';
import { operatorFixtureClient } from './operator-fixture-client.mjs';

const config = parse(readFileSync(new URL('../.env.staging', import.meta.url)));
validateStaging(
  config,
  parse(readFileSync(new URL('../.env', import.meta.url))),
);
assert.equal(config.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
process.env.APP_ENV = 'staging';
process.env.DATABASE_URL = config.DATABASE_URL;
process.env.RUNTIME_DATABASE_URL = config.RUNTIME_DATABASE_URL;
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
  ReportsService,
} = require('../dist/modules/reports/reports.service.js');
const {
  reconcileFinancialEvidence,
} = require('../dist/common/utils/financial-reconciliation.util.js');
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
const prisma = operatorFixtureClient(config);
const apiPrisma = new PrismaService();
const tenant = new TenantPrismaService(apiPrisma);
const email = new EmailService();
const collections = new CollectionsService(tenant, apiPrisma, email);
const loans = new LoansService(tenant, { notify: async () => {} }, email);
const reports = new ReportsService(tenant);
async function reconstructLoan(id) {
  const loan = await prisma.loan.findUniqueOrThrow({
    where: { id },
    include: {
      customer: { select: { organizationId: true } },
      loanProduct: { select: { organizationId: true } },
      schedule: true,
      collections: {
        include: {
          collectedBy: { select: { organizationId: true } },
          customer: { select: { organizationId: true } },
        },
      },
      amendments: true,
    },
  });
  return reconcileFinancialEvidence({
    ...loan,
    startDate: loan.startDate?.toISOString().slice(0, 10) ?? null,
    customerOrganizationId: loan.customer.organizationId,
    productOrganizationId: loan.loanProduct.organizationId,
    schedule: loan.schedule.map((row) => ({
      ...row,
      dueDate: row.dueDate.toISOString().slice(0, 10),
    })),
    payments: loan.collections.map((row) => ({
      ...row,
      collectorOrganizationId: row.collectedBy.organizationId,
      customerOrganizationId: row.customer.organizationId,
      collectionDate: row.collectionDate.toISOString().slice(0, 10),
      collectedAt: row.collectedAt.toISOString(),
      recordedAt: row.recordedAt.toISOString(),
      reversedAt: row.reversedAt?.toISOString() ?? null,
    })),
    amendments: loan.amendments.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
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
let kycPath;
const orgId = randomUUID();
const fixtureJournal = new URL(
  `../../.recovery/fixture-finance-${orgId}.json`,
  import.meta.url,
);
let seeded = false;
let checkpoint = 'connect';
try {
  await apiPrisma.onModuleInit();
  mkdirSync(new URL('../../.recovery/', import.meta.url), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(
    fixtureJournal,
    JSON.stringify({
      organizationId: orgId,
      project: config.STAGING_PROJECT_REF,
      createdAt: new Date().toISOString(),
      syntheticOnly: true,
    }),
    { flag: 'wx', mode: 0o600 },
  );
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
        product,
        paymentLoan: await makeLoan('SYNTHETIC-PAYMENT'),
        closureLoan: await makeLoan('SYNTHETIC-CLOSURE'),
        raceLoan: await makeLoan('SYNTHETIC-RACE'),
        recoveryLoan: await makeLoan('SYNTHETIC-DEFAULT-RECOVERY'),
        cashLoan: await makeLoan('SYNTHETIC-CASH-CARRY'),
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
  checkpoint = 'private customer document';
  const kycDto = {
    relatedEntityType: 'customer',
    relatedEntityId: fixture.customer.id,
    documentType: 'synthetic_kyc',
    fileName: 'synthetic.pdf',
  };
  const kycGrant = await documents.getUploadUrl(
    orgId,
    fixture.agent.id,
    kycDto,
  );
  kycPath = kycGrant.path;
  assert.equal(kycGrant.bucket, 'kyc-documents');
  assert.equal(
    (
      await storage
        .from(kycGrant.bucket)
        .uploadToSignedUrl(
          kycGrant.path,
          kycGrant.token,
          Buffer.from('%PDF-1.4\n% Synthetic verification only\n%%EOF\n'),
          { contentType: 'application/pdf' },
        )
    ).error,
    null,
  );
  const kycDocument = await documents.registerDocument(
    orgId,
    fixture.agent.id,
    { ...kycDto, filePath: kycPath },
  );
  const kycDownload = await documents.getSignedDownloadUrl(
    orgId,
    kycDocument.id,
    fixture.agent.id,
  );
  assert.equal(
    (await fetch(kycDownload.signedUrl, { signal: AbortSignal.timeout(10000) }))
      .status,
    200,
  );
  await assert.rejects(
    documents.getSignedDownloadUrl(
      orgId,
      kycDocument.id,
      fixture.replacementAgent.id,
    ),
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
  checkpoint = 'immutable contract and exact earlier-payment reversal';
  const contractLoan = await loans.create(orgId, fixture.admin.id, {
    customerId: fixture.customer.id,
    loanProductId: fixture.product.id,
    principalAmount: 100,
    tenure: 2,
  });
  assert.equal(contractLoan.financialTerms.version, 1);
  assert.equal(contractLoan.financialTerms.processingFee, '0.00');
  const knownSettlementLoan = await loans.create(orgId, fixture.admin.id, {
    customerId: fixture.customer.id,
    loanProductId: fixture.product.id,
    principalAmount: 100,
    tenure: 2,
  });
  await loans.approve(orgId, knownSettlementLoan.id, fixture.admin.id);
  await loans.disburse(
    orgId,
    knownSettlementLoan.id,
    '2026-10-01',
    fixture.admin.id,
  );
  checkpoint = 'restructure preserves original and replacement schedules';
  const amendmentLoan = await loans.create(orgId, fixture.admin.id, {
    customerId: fixture.customer.id,
    loanProductId: fixture.product.id,
    principalAmount: 100,
    tenure: 2,
  });
  await loans.approve(orgId, amendmentLoan.id, fixture.admin.id);
  await loans.disburse(orgId, amendmentLoan.id, '2026-10-01', fixture.admin.id);
  const originalRows = await prisma.loanSchedule.findMany({
    where: { loanId: amendmentLoan.id },
    orderBy: { installmentNumber: 'asc' },
  });
  const originalLoan = await prisma.loan.findUniqueOrThrow({
    where: { id: amendmentLoan.id },
  });
  const faultedLoans = new LoansService(
    {
      run: (organizationId, operation) =>
        tenant.run(organizationId, (tx) =>
          operation(
            new Proxy(tx, {
              get(target, key) {
                if (key === 'auditLog')
                  return new Proxy(target.auditLog, {
                    get(delegate, method) {
                      if (method === 'create')
                        return async () => {
                          throw new Error('Synthetic audit rejection');
                        };
                      return Reflect.get(delegate, method);
                    },
                  });
                return Reflect.get(target, key);
              },
            }),
          ),
        ),
    },
    { notify: async () => {} },
    email,
  );
  await assert.rejects(
    faultedLoans.restructure(orgId, amendmentLoan.id, fixture.admin.id, {
      fromInstallmentNumber: 1,
      newTenure: 3,
      reason: 'Synthetic rejected amendment',
    }),
    /Synthetic audit rejection/,
  );
  assert.deepEqual(
    await prisma.loanSchedule.findMany({
      where: { loanId: amendmentLoan.id },
      orderBy: { installmentNumber: 'asc' },
    }),
    originalRows,
  );
  assert.deepEqual(
    await prisma.loan.findUniqueOrThrow({ where: { id: amendmentLoan.id } }),
    originalLoan,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: {
        organizationId: orgId,
        entityId: amendmentLoan.id,
        action: 'loan.restructured',
      },
    }),
    0,
  );
  assert.equal(
    await prisma.loanAmendment.count({ where: { loanId: amendmentLoan.id } }),
    0,
  );
  await loans.restructure(orgId, amendmentLoan.id, fixture.admin.id, {
    fromInstallmentNumber: 1,
    newTenure: 3,
    reason: 'Synthetic schedule amendment',
  });
  const amendment = await prisma.auditLog.findFirstOrThrow({
    where: {
      organizationId: orgId,
      entityId: amendmentLoan.id,
      action: 'loan.restructured',
    },
  });
  assert.deepEqual(
    amendment.oldValue.replacedSchedule.map((r) => r.id),
    originalRows.map((r) => r.id),
  );
  assert.equal(amendment.newValue.replacementSchedule.length, 3);
  const durableAmendment = await prisma.loanAmendment.findFirstOrThrow({
    where: { loanId: amendmentLoan.id, version: 1 },
  });
  assert.equal(durableAmendment.operation, 'restructure');
  assert.equal(durableAmendment.actorStaffId, fixture.admin.id);
  assert.deepEqual(durableAmendment.beforeEvidence, amendment.oldValue);
  const {
    amendmentId: auditedAmendmentId,
    amendmentVersion: auditedVersion,
    ...auditedAfter
  } = amendment.newValue;
  assert.equal(auditedAmendmentId, durableAmendment.id);
  assert.equal(auditedVersion, 1);
  assert.deepEqual(durableAmendment.afterEvidence, auditedAfter);
  await assert.rejects(
    prisma.loanAmendment.update({
      where: { id: durableAmendment.id },
      data: { reason: 'Synthetic forbidden rewrite' },
    }),
  );
  await assert.rejects(
    prisma.loanAmendment.delete({ where: { id: durableAmendment.id } }),
  );
  const revised = await prisma.loan.findUniqueOrThrow({
    where: { id: amendmentLoan.id },
    include: { schedule: true },
  });
  assert.ok(
    revised.outstandingBalance.equals(
      revised.schedule.reduce(
        (sum, row) => sum.plus(row.dueAmount.minus(row.paidAmount)),
        new (require('@prisma/client').Prisma.Decimal)(0),
      ),
    ),
  );
  assert.deepEqual(revised.financialTerms, amendmentLoan.financialTerms);
  await loans.restructure(orgId, amendmentLoan.id, fixture.admin.id, {
    fromInstallmentNumber: 1,
    newTenure: 4,
    reason: 'Synthetic second amendment',
  });
  const amendmentVersions = await prisma.loanAmendment.findMany({
    where: { loanId: amendmentLoan.id },
    orderBy: { version: 'asc' },
  });
  assert.deepEqual(
    amendmentVersions.map((a) => a.version),
    [1, 2],
  );
  assert.equal(
    amendmentVersions[1].afterEvidence.replacementSchedule.length,
    4,
  );
  const latestSchedule = await prisma.loanSchedule.findMany({
    where: { loanId: amendmentLoan.id },
    orderBy: { installmentNumber: 'asc' },
  });
  assert.equal((await reconstructLoan(amendmentLoan.id)).state, 'consistent');
  checkpoint = 'saved zero-fee policy rejects drifted schedule charges';
  await prisma.$transaction(async (tx) => {
    await tx.loanSchedule.update({
      where: { id: latestSchedule[0].id },
      data: { dueAmount: { increment: 1 } },
    });
    await tx.loan.update({
      where: { id: amendmentLoan.id },
      data: {
        totalPayable: { increment: 1 },
        outstandingBalance: { increment: 1 },
      },
    });
  });
  const drifted = await prisma.loan.findUniqueOrThrow({
    where: { id: amendmentLoan.id },
    include: { schedule: { orderBy: { installmentNumber: 'asc' } } },
  });
  await assert.rejects(
    collections.recordCollection(orgId, fixture.agent.id, {
      ...payment(amendmentLoan.id),
      amount: 1,
    }),
    /saved zero-fee contract/,
  );
  await assert.rejects(
    loans.getPreClosureDetails(orgId, amendmentLoan.id),
    /saved zero-fee contract/,
  );
  await assert.rejects(
    loans.restructure(orgId, amendmentLoan.id, fixture.admin.id, {
      fromInstallmentNumber: 1,
      newTenure: 4,
    }),
    /saved zero-fee contract/,
  );
  assert.equal(
    await prisma.collection.count({ where: { loanId: amendmentLoan.id } }),
    0,
  );
  assert.deepEqual(
    await prisma.loan.findUniqueOrThrow({
      where: { id: amendmentLoan.id },
      include: { schedule: { orderBy: { installmentNumber: 'asc' } } },
    }),
    drifted,
  );
  assert.equal((await reconstructLoan(amendmentLoan.id)).state, 'inconsistent');
  checkpoint = 'immutable contract and exact earlier-payment reversal';
  await prisma.loanProduct.update({
    where: { id: fixture.product.id },
    data: { interestRateAnnual: 18, processingFee: 9, lateFeeValue: 9 },
  });
  await loans.approve(orgId, contractLoan.id, fixture.admin.id);
  const disbursed = await loans.disburse(
    orgId,
    contractLoan.id,
    '2026-10-01',
    fixture.admin.id,
  );
  assert.equal(disbursed.loan.interestRateAnnual.toString(), '12');
  assert.equal(disbursed.loan.financialTerms.processingFee, '0.00');
  let acknowledgementLost = true;
  const ambiguousPrisma = new Proxy(apiPrisma, {
    get(target, key) {
      if (key === '$transaction')
        return async (...args) => {
          const result = await target.$transaction(...args);
          if (acknowledgementLost) {
            acknowledgementLost = false;
            throw new (require('@prisma/client').Prisma.PrismaClientKnownRequestError)(
              'Synthetic lost commit acknowledgement',
              { code: 'P2028', clientVersion: 'synthetic-test' },
            );
          }
          return result;
        };
      return Reflect.get(target, key);
    },
  });
  const retryCollections = new CollectionsService(
    new TenantPrismaService(ambiguousPrisma),
    apiPrisma,
    email,
  );
  const firstPayment = await retryCollections.recordCollection(
    orgId,
    fixture.agent.id,
    { ...payment(contractLoan.id), amount: disbursed.schedule[0].dueAmount },
  );
  assert.equal(firstPayment.status, 'duplicate');
  const firstAllocation = (
    await prisma.collection.findUniqueOrThrow({
      where: { id: firstPayment.collection.id },
    })
  ).allocationDetails;
  assert.equal(firstAllocation.componentVersion, 1);
  assert.equal(firstAllocation.rows.length, 1);
  assert.equal(
    firstAllocation.rows[0].principal,
    disbursed.schedule[0].principalComponent.toFixed(2),
  );
  assert.equal(
    firstAllocation.rows[0].interest,
    disbursed.schedule[0].interestComponent.toFixed(2),
  );
  assert.equal(firstAllocation.rows[0].fees, '0.00');
  assert.equal(
    await prisma.collection.count({ where: { loanId: contractLoan.id } }),
    1,
  );
  await collections.recordCollection(orgId, fixture.agent.id, {
    ...payment(contractLoan.id),
    amount: disbursed.schedule[1].dueAmount,
  });
  assert.equal(
    (await prisma.loan.findUniqueOrThrow({ where: { id: contractLoan.id } }))
      .status,
    'closed',
  );
  await assert.rejects(
    prisma.loan.update({
      where: { id: contractLoan.id },
      data: { financialTerms: { version: 1, processingFee: '9.00' } },
    }),
  );
  await assert.rejects(
    prisma.collection.update({
      where: { id: firstPayment.collection.id },
      data: { allocationDetails: { version: 1, rows: [] } },
    }),
  );
  await collections.reverseCollection(
    orgId,
    firstPayment.collection.id,
    fixture.admin.id,
    'Synthetic earlier payment reversal',
  );
  const contractRows = await prisma.loanSchedule.findMany({
    where: { loanId: contractLoan.id },
    orderBy: { installmentNumber: 'asc' },
  });
  assert.equal(contractRows[0].paidAmount.toString(), '0');
  assert.equal(contractRows[0].paidPrincipal.toString(), '0');
  assert.equal(contractRows[0].paidInterest.toString(), '0');
  assert.equal(contractRows[0].paidFees.toString(), '0');
  assert.ok(contractRows[1].paidAmount.equals(contractRows[1].dueAmount));
  assert.ok(
    contractRows[1].paidPrincipal.equals(contractRows[1].principalComponent),
  );
  assert.ok(
    contractRows[1].paidInterest.equals(contractRows[1].interestComponent),
  );
  const reopened = await prisma.loan.findUniqueOrThrow({
    where: { id: contractLoan.id },
  });
  assert.equal(reopened.status, 'active');
  assert.ok(reopened.outstandingBalance.equals(contractRows[0].dueAmount));
  checkpoint = 'same-installment earlier partial payment reversal';
  const earlierPartial = await collections.recordCollection(
    orgId,
    fixture.agent.id,
    { ...payment(contractLoan.id), amount: 1.01 },
  );
  const laterPartial = await collections.recordCollection(
    orgId,
    fixture.agent.id,
    { ...payment(contractLoan.id), amount: 2.02 },
  );
  const laterPartialEvidence = (
    await prisma.collection.findUniqueOrThrow({
      where: { id: laterPartial.collection.id },
    })
  ).allocationDetails;
  assert.equal(laterPartialEvidence.rows.length, 1);
  assert.equal(laterPartialEvidence.rows[0].scheduleId, contractRows[0].id);
  await collections.reverseCollection(
    orgId,
    earlierPartial.collection.id,
    fixture.admin.id,
    'Synthetic earlier partial reversal',
  );
  const partialRow = await prisma.loanSchedule.findUniqueOrThrow({
    where: { id: contractRows[0].id },
  });
  assert.equal(partialRow.paidAmount.toFixed(2), '2.02');
  assert.equal(
    partialRow.paidPrincipal.toFixed(2),
    laterPartialEvidence.rows[0].principal,
  );
  assert.equal(
    partialRow.paidInterest.toFixed(2),
    laterPartialEvidence.rows[0].interest,
  );
  assert.equal(
    partialRow.paidFees.toFixed(2),
    laterPartialEvidence.rows[0].fees,
  );
  checkpoint = 'partial payment closure approval';
  const reconstructedPartial = await reconstructLoan(contractLoan.id);
  assert.equal(reconstructedPartial.state, 'consistent');
  assert.equal(
    reconstructedPartial.reconstructed.componentTotalsComplete,
    true,
  );
  await collections.recordCollection(orgId, fixture.agent.id, {
    ...payment(knownSettlementLoan.id),
    amount: 1.01,
  });
  const knownQuote = await loans.getPreClosureDetails(
    orgId,
    knownSettlementLoan.id,
  );
  await loans.close(orgId, knownSettlementLoan.id, fixture.admin.id, {
    preClosureAmount: knownQuote.preClosureAmount,
  });
  const reconstructedSettlement = await reconstructLoan(knownSettlementLoan.id);
  assert.equal(reconstructedSettlement.state, 'consistent');
  assert.equal(
    reconstructedSettlement.reconstructed.settlementTotal,
    new (require('@prisma/client').Prisma.Decimal)(
      knownQuote.preClosureAmount,
    ).toFixed(2),
  );
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
      where: {
        organizationId: orgId,
        entityId: fixture.closureLoan.id,
        action: 'loan.pre_closed',
      },
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
  const settlement = await prisma.collection.findFirstOrThrow({
    where: { loanId: actual.id, notes: 'Pre-closure payment' },
  });
  const settlementEvidence = settlement.allocationDetails;
  assert.equal(settlementEvidence.type, 'early_closure');
  assert.equal(settlementEvidence.componentVersion, 1);
  const Decimal = require('@prisma/client').Prisma.Decimal;
  assert.ok(
    new Decimal(settlementEvidence.principal)
      .plus(settlementEvidence.interest)
      .plus(settlementEvidence.fees)
      .plus(settlementEvidence.penalty)
      .equals(settlement.amount),
  );
  assert.ok(settlementEvidence.sourceSchedule.length > 0);
  assert.equal(
    settlementEvidence.waivedAmount,
    new Decimal(quote.amountSaved).toFixed(2),
  );
  await assert.rejects(
    prisma.collection.update({
      where: { id: settlement.id },
      data: { allocationDetails: { version: 1 } },
    }),
  );
  checkpoint = 'direct client denial';
  checkpoint = 'dashboard scheduled fulfillment and overdue stock';
  const { businessDate } = require('../dist/modules/loans/utils/date.util.js');
  const today = businessDate();
  const dateBefore = (days) => {
    const value = new Date(today);
    value.setUTCDate(value.getUTCDate() - days);
    return value.toISOString().slice(0, 10);
  };
  const reportActor = {
    type: 'staff',
    organizationId: orgId,
    id: fixture.agent.id,
    role: 'agent',
    branchId: null,
  };
  const beforeReport = await reports.getDashboardSummary(orgId, reportActor);
  await prisma.loanProduct.update({
    where: { id: fixture.product.id },
    data: {
      interestRateAnnual: 0,
      processingFee: 0,
      lateFeeValue: 0,
      collectionFrequency: 'daily',
    },
  });
  const reportLoan = async (startDate) => {
    const loan = await loans.create(orgId, fixture.admin.id, {
      customerId: fixture.customer.id,
      loanProductId: fixture.product.id,
      principalAmount: 100,
      tenure: 1,
    });
    await loans.approve(orgId, loan.id, fixture.admin.id);
    await loans.disburse(orgId, loan.id, startDate, fixture.admin.id);
    return loan;
  };
  const dueReportLoan = await reportLoan(dateBefore(1));
  const paidReportLoan = await reportLoan(dateBefore(1));
  const arrearsReportLoan = await reportLoan(dateBefore(33));
  for (const [loan, amount] of [
    [dueReportLoan, 50],
    [paidReportLoan, 100],
    [arrearsReportLoan, 10],
  ]) {
    await collections.recordCollection(orgId, fixture.agent.id, {
      ...payment(loan.id),
      amount,
      collectionDate: today.toISOString().slice(0, 10),
      collectedAt: new Date().toISOString(),
    });
  }
  const afterReport = await reports.getDashboardSummary(orgId, reportActor);
  assert.equal(
    afterReport.scheduledDueToday,
    beforeReport.scheduledDueToday + 200,
  );
  assert.equal(
    afterReport.paidTowardDueToday,
    beforeReport.paidTowardDueToday + 150,
  );
  assert.equal(afterReport.dueToday, beforeReport.dueToday + 50);
  assert.equal(afterReport.collectedToday, beforeReport.collectedToday + 160);
  assert.equal(
    afterReport.collectionEfficiency,
    new Decimal(afterReport.paidTowardDueToday)
      .div(afterReport.scheduledDueToday)
      .mul(100)
      .toDecimalPlaces(0)
      .toNumber(),
  );
  assert.equal(afterReport.overdueCount, beforeReport.overdueCount + 1);
  const futureReportLoan = await reportLoan(dateBefore(-1));
  const zeroDueRow = await prisma.loanSchedule.create({
    data: {
      loanId: futureReportLoan.id,
      installmentNumber: 2,
      dueDate: new Date(dateBefore(1)),
      principalComponent: 0,
      interestComponent: 0,
      dueAmount: 0,
      paidAmount: 0,
      paidPrincipal: 0,
      paidInterest: 0,
      paidFees: 0,
      status: 'pending',
    },
  });
  const finalReport = await reports.getDashboardSummary(orgId, reportActor);
  assert.equal(finalReport.overdueCount, afterReport.overdueCount);
  const overdueReport = await reports.getOverdue(
    orgId,
    { limit: 200 },
    reportActor,
  );
  assert.ok(overdueReport.data.every((row) => row.id !== zeroDueRow.id));
  const riskReport = await reports.getPortfolioAtRisk(orgId, reportActor);
  assert.equal(riskReport.par_30, finalReport.portfolioAtRisk30);
  const riskLoans = await prisma.loan.findMany({
    where: {
      organizationId: orgId,
      assignedAgentId: fixture.agent.id,
      status: { in: ['active', 'defaulted'] },
    },
    include: { schedule: true },
  });
  const expectedRisk = riskLoans
    .reduce(
      (sum, loan) =>
        loan.schedule.some(
          (row) =>
            ['pending', 'partially_paid', 'overdue'].includes(row.status) &&
            row.dueAmount.gt(row.paidAmount) &&
            (today.getTime() - row.dueDate.getTime()) / 86400000 > 30,
        )
          ? sum.plus(loan.outstandingBalance)
          : sum,
      new Decimal(0),
    )
    .div(new Decimal(finalReport.totalOutstanding))
    .toNumber();
  assert.ok(Math.abs(riskReport.par_30 - expectedRisk) < 1e-10);
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
  checkpoint = 'cash carry-forward and independent verification';
  const handovers = new CashDepositsService(tenant, prisma);
  assert.equal(
    (
      await prisma.loan.findUniqueOrThrow({
        where: { id: fixture.cashLoan.id },
      })
    ).assignedAgentId,
    fixture.replacementAgent.id,
  );
  await collections.recordCollection(
    orgId,
    fixture.replacementAgent.id,
    payment(fixture.cashLoan.id),
  );
  const handover = await handovers.create(orgId, fixture.replacementAgent.id, {
    amount: 10,
    depositDate: '2026-10-11',
  });
  await handovers.verify(orgId, handover.id, fixture.admin.id, {
    status: 'verified',
  });
  const ownHandover = await handovers.create(orgId, fixture.admin.id, {
    amount: 1,
    depositDate: '2026-10-11',
  });
  await assert.rejects(
    handovers.verify(orgId, ownHandover.id, fixture.admin.id, {
      status: 'verified',
    }),
    (error) => error?.getStatus?.() === 403,
  );
  await prisma.staff.update({
    where: { id: fixture.replacementAgent.id },
    data: { isActive: false },
  });
  const cashRows = await handovers.getReconciliation(
    orgId,
    '2026-10-12',
    '2026-10-12',
    actor,
  );
  const cashRow = cashRows.find(
    (row) => row.agentId === fixture.replacementAgent.id,
  );
  assert.equal(cashRow.openingBalance, 45);
  assert.equal(cashRow.closingBalance, 45);
  assert.equal(cashRow.difference, 0);
  assert.equal(cashRow.status, 'discrepancy');
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
      cashReconciliation:
        'carry-forward preserved for inactive staff; own handover verification denied',
      data: 'synthetic only',
      immutableFinancialEvidence:
        'product changes do not change saved policy; contract/allocation overwrites denied; reversing earlier payment leaves later installment paid',
      restructureEvidence:
        'immutable versioned amendments preserve schedules; audit rejection rolls back amendment, loan and schedule; second amendment accepted',
      paymentComponents:
        'exact principal/interest/fee amounts persisted and earlier reversal preserves later components',
      settlementComponents:
        'immutable early-closure components and waived amount reconcile to the receipt without rewriting original installments',
      independentFinancialReconstruction:
        'known partial reversals, multi-amendment history and early closure reconstruct; intentional drift is detected',
      zeroFeeScheduleDrift:
        'payments, payoff quotes and restructuring denied without mutations',
      lostCommitAcknowledgement:
        'one posting; bounded retry acknowledges original payment identifier',
      privateKyc: 'owned PDF upload/download passed; another agent denied',
      dashboardFinancialDefinitions:
        'full scheduled denominator includes paid closed rows; unrelated receipts do not inflate fulfillment; positive overdue amounts and IST portfolio risk verified',
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
      if (kycPath)
        assert.equal(
          (await storage.from('kyc-documents').remove([kycPath])).error,
          null,
        );
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
      unlinkSync(fixtureJournal);
    } catch {
      console.error('Synthetic fixture cleanup needs attention.');
      process.exitCode = 1;
    }
  }
  if (!seeded) {
    // The seed transaction never committed. No fixture was established.
    try {
      unlinkSync(fixtureJournal);
    } catch {
      /* Keep diagnostics secret-free. */
    }
  }
  await prisma.$disconnect();
  await apiPrisma.onModuleDestroy();
}
