import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID, randomBytes, createECDH } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { validateStaging } from './staging.mjs';
import { operatorFixtureClient } from './operator-fixture-client.mjs';

const config = parse(readFileSync(new URL('../.env.staging', import.meta.url)));
validateStaging(
  config,
  parse(readFileSync(new URL('../.env', import.meta.url))),
);
assert.equal(config.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
for (const key of [
  'APP_ENV',
  'DATABASE_URL',
  'RUNTIME_DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
])
  process.env[key] = config[key];
const require = createRequire(import.meta.url);
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const {
  DocumentsService,
} = require('../dist/modules/documents/documents.service.js');
const {
  TenantPrismaService,
} = require('../dist/prisma/tenant-prisma.service.js');
const { StaffService } = require('../dist/modules/staff/staff.service.js');
const {
  OrganizationsService,
} = require('../dist/modules/organizations/organizations.service.js');
const {
  CustomersService,
} = require('../dist/modules/customers/customers.service.js');
const {
  ProvisioningReconciliationService,
} = require('../dist/modules/staff/provisioning-reconciliation.service.js');
const {
  SupabaseAuthGuard,
} = require('../dist/common/guards/supabase-auth.guard.js');
const {
  NotificationsService,
} = require('../dist/modules/notifications/notifications.service.js');
const prisma = operatorFixtureClient(config);
const apiPrisma = new PrismaService();
const tenant = new TenantPrismaService(apiPrisma);
const staff = new StaffService(tenant);
const notifications = new NotificationsService(apiPrisma, tenant);
const orgId = randomUUID();
let seeded = false;
let checkpoint = 'fixture';
const providerIds = new Set();
const onboardingOrgIds = new Set();
const storagePaths = new Set();
let createdKycBucket = false;
try {
  await apiPrisma.onModuleInit();
  const fixture = await prisma.$transaction(
    async (tx) => {
      await tx.organization.create({
        data: { id: orgId, name: 'Synthetic provisioning check' },
      });
      const admin = await tx.staff.create({
        data: {
          organizationId: orgId,
          authUserId: randomUUID(),
          fullName: 'Synthetic administrator',
          email: 'synthetic-admin@example.test',
          role: 'org_admin',
        },
      });
      const branch = await tx.branch.create({
        data: { organizationId: orgId, name: 'Synthetic authorized branch' },
      });
      const otherBranch = await tx.branch.create({
        data: { organizationId: orgId, name: 'Synthetic other branch' },
      });
      const manager = await tx.staff.create({
        data: {
          organizationId: orgId,
          authUserId: randomUUID(),
          fullName: 'Synthetic manager',
          email: 'synthetic-manager@example.test',
          role: 'branch_manager',
          branchId: branch.id,
        },
      });
      await tx.customer.create({
        data: {
          organizationId: orgId,
          branchId: branch.id,
          fullName: 'Synthetic local',
          phone: '0000000000',
        },
      });
      await tx.customer.create({
        data: {
          organizationId: orgId,
          branchId: otherBranch.id,
          fullName: 'Synthetic other',
          phone: '0000000001',
        },
      });
      return { admin, manager, branch, otherBranch };
    },
    { timeout: 30000 },
  );
  seeded = true;
  checkpoint = 'provider creation without staging invitation';
  const email = `staging-provision-${randomUUID()}@example.test`;
  const created = await staff.create(
    orgId,
    { email, fullName: 'Synthetic provisioned agent', role: 'agent' },
    fixture.admin.id,
  );
  providerIds.add(created.authUserId);
  assert.equal(created.organizationId, orgId);
  assert.equal(Object.hasOwn(created, 'twoFactorSecret'), false);
  const provider = await staff.supabaseAdmin.auth.admin.getUserById(
    created.authUserId,
  );
  assert.equal(provider.error, null);
  assert.ok(provider.data.user?.app_metadata.pigmie_provisioning_attempt);
  checkpoint = 'provider compensation after database failure';
  const brokenTenant = {
    run: (org, callback, options) =>
      tenant.run(
        org,
        (tx) =>
          callback(
            new Proxy(tx, {
              get(target, property) {
                if (property === 'staff')
                  return {
                    ...target.staff,
                    create: async () => {
                      throw new Error('Injected synthetic persistence failure');
                    },
                  };
                return Reflect.get(target, property);
              },
            }),
          ),
        options,
      ),
  };
  const broken = new StaffService(brokenTenant);
  const originalCreate = broken.supabaseAdmin.auth.admin.createUser.bind(
    broken.supabaseAdmin.auth.admin,
  );
  let compensatedId;
  broken.supabaseAdmin.auth.admin.createUser = async (...args) => {
    const result = await originalCreate(...args);
    if (result.data.user) {
      compensatedId = result.data.user.id;
      providerIds.add(compensatedId);
    }
    return result;
  };
  await assert.rejects(
    broken.create(
      orgId,
      {
        email: `staging-failure-${randomUUID()}@example.test`,
        fullName: 'Synthetic failed staff',
        role: 'agent',
      },
      fixture.admin.id,
    ),
  );
  assert.ok(compensatedId);
  const compensated =
    await staff.supabaseAdmin.auth.admin.getUserById(compensatedId);
  assert.ok(compensated.error && !compensated.data.user);
  providerIds.delete(compensatedId);
  checkpoint = 'push subscription ownership';
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  const subscription = {
    endpoint: `https://fcm.googleapis.com/fcm/send/SYNTHETIC-${randomUUID()}`,
    keys: {
      p256dh: curve.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  await notifications.subscribe(orgId, 'staff', created.id, subscription);
  await assert.rejects(
    notifications.subscribe(orgId, 'staff', fixture.manager.id, {
      ...subscription,
      keys: {
        ...subscription.keys,
        auth: randomBytes(16).toString('base64url'),
      },
    }),
    (error) => error.getStatus() === 409,
  );
  await notifications.subscribe(
    orgId,
    'staff',
    fixture.manager.id,
    subscription,
  );
  await notifications.unsubscribe(orgId, 'staff', created.id, subscription);
  assert.equal(
    await prisma.pushSubscription.count({
      where: { endpoint: subscription.endpoint },
    }),
    1,
  );
  await notifications.unsubscribe(
    orgId,
    'staff',
    fixture.manager.id,
    subscription,
  );
  assert.equal(
    await prisma.pushSubscription.count({
      where: { endpoint: subscription.endpoint },
    }),
    0,
  );
  await assert.rejects(
    notifications.subscribe(orgId, 'staff', created.id, {
      ...subscription,
      endpoint: 'https://localhost/private',
    }),
    (error) => error.getStatus() === 400,
  );
  checkpoint = 'SMS scope without delivery';
  await notifications.authorizeSmsRecipients(orgId, fixture.manager.id, [
    '0000000000',
  ]);
  await assert.rejects(
    notifications.authorizeSmsRecipients(orgId, fixture.manager.id, [
      '0000000000',
      '0000000001',
    ]),
    (error) => error.getStatus() === 403,
  );
  checkpoint = 'staff mutation permission races';
  async function afterActorChange(
    change,
    mutate,
    actorId = fixture.admin.id,
    expectedStatus = 403,
  ) {
    const applicationName = `synthetic-staff-race-${randomUUID()}`;
    const racingStaff = new StaffService({
      run: (org, callback) =>
        tenant.run(
          org,
          async (tx) => {
            await tx.$executeRaw`SELECT set_config('application_name', ${applicationName}, true)`;
            return callback(tx);
          },
          { timeout: 30000 },
        ),
    });
    let release;
    let ready;
    const changed = new Promise((resolve) => {
      ready = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.staff.update({
          where: { id: actorId },
          data: change,
        });
        ready();
        await gate;
      },
      { timeout: 30000 },
    );
    // Observe setup failure as well as successful acquisition, without logging it.
    await Promise.race([
      changed,
      holder.then(() => {
        throw new Error('Missing lock');
      }),
    ]);
    const request = mutate(racingStaff).then(
      () => ({ status: 200 }),
      (error) => ({
        status: typeof error.getStatus === 'function' ? error.getStatus() : 500,
      }),
    );
    try {
      let blocked = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const waiting =
          await prisma.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = ${applicationName} AND wait_event_type = 'Lock'`;
        if (waiting[0].count > 0) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        blocked,
        true,
        'Mutation must actually overlap the permission change',
      );
      release();
      await holder;
      assert.equal((await request).status, expectedStatus);
    } finally {
      release();
      await Promise.allSettled([holder, request]);
    }
  }
  const targetBefore = await prisma.staff.findUnique({
    where: { id: created.id },
  });
  await afterActorChange({ isActive: false }, (service) =>
    service.update(
      orgId,
      created.id,
      { fullName: 'Must not commit' },
      fixture.admin.id,
    ),
  );
  await prisma.staff.update({
    where: { id: fixture.admin.id },
    data: { isActive: true },
  });
  await afterActorChange({ role: 'agent' }, (service) =>
    service.remove(orgId, created.id, fixture.admin.id),
  );
  const targetAfter = await prisma.staff.findUnique({
    where: { id: created.id },
  });
  assert.equal(targetAfter.fullName, targetBefore.fullName);
  assert.equal(targetAfter.isActive, true);
  await prisma.staff.update({
    where: { id: fixture.admin.id },
    data: { role: 'org_admin' },
  });
  checkpoint = 'staff directory permission races';
  await afterActorChange({ isActive: false }, (service) =>
    service.findAll(orgId, {}, fixture.admin.id),
  );
  await prisma.staff.update({
    where: { id: fixture.admin.id },
    data: { isActive: true },
  });
  await afterActorChange({ role: 'agent' }, (service) =>
    service.findOne(orgId, created.id, fixture.admin.id),
  );
  await prisma.staff.update({
    where: { id: fixture.admin.id },
    data: { role: 'org_admin' },
  });
  await staff.update(
    orgId,
    created.id,
    { branchId: fixture.branch.id },
    fixture.admin.id,
  );
  const managerDirectory = await staff.findAll(
    orgId,
    { branchId: fixture.otherBranch.id },
    fixture.manager.id,
  );
  assert.ok(managerDirectory.data.some((row) => row.id === created.id));
  assert.ok(
    managerDirectory.data.every((row) => row.branchId === fixture.branch.id),
  );
  assert.equal(
    (await staff.findOne(orgId, created.id, fixture.manager.id)).id,
    created.id,
  );
  await afterActorChange(
    { branchId: fixture.otherBranch.id },
    (service) => service.findOne(orgId, created.id, fixture.manager.id),
    fixture.manager.id,
    404,
  );
  const movedDirectory = await staff.findAll(
    orgId,
    { branchId: fixture.branch.id },
    fixture.manager.id,
  );
  assert.ok(movedDirectory.data.length > 0);
  assert.ok(
    movedDirectory.data.every((row) => row.branchId === fixture.otherBranch.id),
  );
  assert.ok(!movedDirectory.data.some((row) => row.id === created.id));
  const adminDirectory = await staff.findAll(orgId, {}, fixture.admin.id);
  assert.ok(adminDirectory.data.some((row) => row.id === created.id));
  assert.ok(adminDirectory.data.some((row) => row.id === fixture.manager.id));
  assert.ok(
    adminDirectory.data.every((row) => !Object.hasOwn(row, 'twoFactorSecret')),
  );
  checkpoint = 'reciprocal administrator updates';
  const reconciliation = new ProvisioningReconciliationService(apiPrisma);
  checkpoint = 'unfinished provisioning recovery';
  const orphanEmail = `staging-orphan-${randomUUID()}@example.test`;
  const orphanPassword = randomBytes(32).toString('base64url');
  const orphanResult = await staff.supabaseAdmin.auth.admin.createUser({
    email: orphanEmail,
    password: orphanPassword,
    email_confirm: true,
    app_metadata: {
      pigmie_provisioning_attempt: randomUUID(),
      pigmie_organization_id: orgId,
    },
  });
  assert.equal(orphanResult.error, null);
  const orphanId = orphanResult.data.user.id;
  providerIds.add(orphanId);
  const freshReport = await reconciliation.inspect();
  assert.ok(!freshReport.some((row) => row.authUserId === orphanId));
  await prisma.$executeRaw`UPDATE auth.users SET created_at = now() - interval '20 minutes' WHERE id IN (${orphanId}::uuid, ${created.authUserId}::uuid)`;
  const oldReport = await reconciliation.inspect();
  assert.ok(
    oldReport.some(
      (row) => row.authUserId === orphanId && row.organizationId === orgId,
    ),
  );
  assert.ok(!oldReport.some((row) => row.authUserId === created.authUserId));
  const orphanAuth = createClient(
    config.SUPABASE_URL,
    config.STAGING_PUBLIC_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    },
  );
  const orphanSigned = await orphanAuth.auth.signInWithPassword({
    email: orphanEmail,
    password: orphanPassword,
  });
  assert.equal(orphanSigned.error, null);
  const orphanRequest = {
    headers: {
      authorization: `Bearer ${orphanSigned.data.session.access_token}`,
    },
  };
  await assert.rejects(
    new SupabaseAuthGuard(apiPrisma).canActivate({
      getHandler: () => () => undefined,
      switchToHttp: () => ({ getRequest: () => orphanRequest }),
    }),
    (error) =>
      error.getStatus() === 401 &&
      error.message === 'Staff provisioning is incomplete',
  );
  assert.equal(orphanRequest.user, undefined);
  await prisma.customer.updateMany({
    where: { organizationId: orgId, phone: '0000000000' },
    data: { authUserId: orphanId, isActive: false },
  });
  const linkedReport = await reconciliation.inspect();
  assert.ok(!linkedReport.some((row) => row.authUserId === orphanId));
  checkpoint = 'serialized provisioning compensation';
  assert.equal((await reconciliation.reconcile()).deleted, 0);
  await prisma.customer.updateMany({
    where: { organizationId: orgId, authUserId: orphanId },
    data: { authUserId: null },
  });
  const attemptId = oldReport.find(
    (row) => row.authUserId === orphanId,
  ).attemptId;
  const {
    provisioningLockKey,
  } = require('../dist/common/utils/provisioning-lock.util.js');
  let releaseAttempt;
  let attemptReady;
  const attemptGate = new Promise((resolve) => {
    releaseAttempt = resolve;
  });
  const attemptHeld = new Promise((resolve) => {
    attemptReady = resolve;
  });
  const heldAttempt = prisma.$transaction(
    async (tx) => {
      const lockKey = provisioningLockKey(attemptId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      attemptReady();
      await attemptGate;
    },
    { timeout: 30000 },
  );
  try {
    await Promise.race([attemptHeld, heldAttempt]);
    const lockedRecovery = await reconciliation.reconcile();
    assert.equal(lockedRecovery.deleted, 0);
    assert.equal(lockedRecovery.skipped, 1);
  } finally {
    releaseAttempt();
    await heldAttempt;
  }
  const compensation = await Promise.all([
    reconciliation.reconcile(),
    reconciliation.reconcile(),
  ]);
  assert.equal(
    compensation.reduce((sum, result) => sum + result.deleted, 0),
    1,
  );
  assert.equal(
    compensation.reduce((sum, result) => sum + result.failed, 0),
    0,
  );
  const removedOrphan =
    await staff.supabaseAdmin.auth.admin.getUserById(orphanId);
  assert.ok(removedOrphan.error && !removedOrphan.data.user);
  providerIds.delete(orphanId);
  checkpoint = 'reciprocal administrator updates';
  await staff.update(
    orgId,
    created.id,
    { role: 'org_admin' },
    fixture.admin.id,
  );
  await Promise.all([
    staff.update(orgId, created.id, { phone: '0000000003' }, fixture.admin.id),
    staff.update(orgId, fixture.admin.id, { phone: '0000000004' }, created.id),
  ]);
  await staff.update(orgId, created.id, { role: 'agent' }, fixture.admin.id);
  await staff.update(orgId, created.id, { phone: '0000000005' }, created.id);
  await assert.rejects(
    staff.update(orgId, created.id, { role: 'org_admin' }, created.id),
    (error) => error.getStatus() === 403,
  );
  checkpoint = 'inactive self mutation denial';
  checkpoint = 'organization onboarding';
  const organizations = new OrganizationsService(apiPrisma, tenant);
  await assert.rejects(
    organizations.createOrganization(orphanId, {
      organizationName: 'Must not create',
      adminFullName: 'Synthetic',
      adminEmail: orphanEmail,
    }),
    (error) => error.getStatus() === 403,
  );
  const onboardingEmail = `staging-onboarding-${randomUUID()}@example.test`;
  const onboardingProvider = await staff.supabaseAdmin.auth.admin.createUser({
    email: onboardingEmail,
    email_confirm: true,
  });
  assert.equal(onboardingProvider.error, null);
  const onboardingId = onboardingProvider.data.user.id;
  providerIds.add(onboardingId);
  const onboardingDto = {
    organizationName: 'Synthetic concurrent onboarding',
    adminFullName: 'Synthetic',
    adminEmail: onboardingEmail,
  };
  const onboarding = await Promise.allSettled([
    organizations.createOrganization(onboardingId, onboardingDto),
    organizations.createOrganization(onboardingId, onboardingDto),
  ]);
  for (const result of onboarding)
    if (result.status === 'fulfilled')
      onboardingOrgIds.add(result.value.organization.id);
  assert.equal(
    onboarding.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    onboarding
      .find((result) => result.status === 'rejected')
      .reason.getStatus(),
    409,
  );
  const onboarded = onboarding.find(
    (result) => result.status === 'fulfilled',
  ).value;
  assert.equal(Object.hasOwn(onboarded.staff, 'twoFactorSecret'), false);
  assert.equal(onboarded.organization.currency, 'INR');
  assert.equal(onboarded.organization.timezone, 'Asia/Kolkata');
  await afterActorChange({ role: 'agent' }, (service) =>
    new OrganizationsService(
      apiPrisma,
      service.tenantPrisma,
    ).updateOrganization(orgId, { name: 'Must not change' }, fixture.admin.id),
  );
  await prisma.staff.update({
    where: { id: fixture.admin.id },
    data: { role: 'org_admin' },
  });
  assert.equal(
    (await organizations.getMyOrganization(orgId, fixture.admin.id)).name,
    'Synthetic provisioning check',
  );
  checkpoint = 'inactive self mutation denial';
  checkpoint = 'customer portal provisioning';
  const customers = new CustomersService(tenant, {});
  const portalTarget = await prisma.customer.findFirst({
    where: { organizationId: orgId, phone: '0000000001' },
  });
  const portalEmail = `staging-portal-${randomUUID()}@example.test`;
  const grants = await Promise.allSettled([
    customers.grantPortalAccess(
      orgId,
      portalTarget.id,
      { email: portalEmail },
      fixture.admin.id,
    ),
    customers.grantPortalAccess(
      orgId,
      portalTarget.id,
      { email: portalEmail },
      fixture.admin.id,
    ),
  ]);
  for (const grant of grants)
    if (grant.status === 'fulfilled') providerIds.add(grant.value.authUserId);
  assert.equal(
    grants.filter((grant) => grant.status === 'fulfilled').length,
    1,
  );
  const failedGrant = grants.find((grant) => grant.status === 'rejected');
  assert.equal(failedGrant.reason.getStatus(), 400);
  const portal = grants.find((grant) => grant.status === 'fulfilled').value;
  assert.equal(Object.hasOwn(portal, 'idProofNumberEncrypted'), false);
  const portalPassword = randomBytes(32).toString('base64url');
  const confirmedPortal = await staff.supabaseAdmin.auth.admin.updateUserById(
    portal.authUserId,
    { password: portalPassword, email_confirm: true },
  );
  assert.equal(confirmedPortal.error, null);
  const signedPortal = await orphanAuth.auth.signInWithPassword({
    email: portalEmail,
    password: portalPassword,
  });
  assert.equal(signedPortal.error, null);
  const portalRequest = {
    headers: {
      authorization: `Bearer ${signedPortal.data.session.access_token}`,
    },
  };
  const portalContext = {
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => portalRequest }),
  };
  assert.equal(
    await new SupabaseAuthGuard(apiPrisma).canActivate(portalContext),
    true,
  );
  assert.equal(portalRequest.user.type, 'customer');
  await afterActorChange({ isActive: false }, (service) => {
    const scopedCustomers = new CustomersService(service.tenantPrisma, {});
    return scopedCustomers.revokePortalAccess(
      orgId,
      portalTarget.id,
      fixture.admin.id,
    );
  });
  await prisma.staff.update({
    where: { id: fixture.admin.id },
    data: { isActive: true },
  });
  await customers.revokePortalAccess(
    orgId,
    portalTarget.id,
    fixture.manager.id,
  );
  const disabledPortal = await prisma.customer.findUnique({
    where: { id: portalTarget.id },
  });
  assert.equal(disabledPortal.authUserId, portal.authUserId);
  assert.equal(disabledPortal.portalAccessEnabled, false);
  await assert.rejects(
    new SupabaseAuthGuard(apiPrisma).canActivate(portalContext),
    (error) => error.getStatus() === 401,
  );
  const retainedProvider = await staff.supabaseAdmin.auth.admin.getUserById(
    portal.authUserId,
  );
  assert.equal(retainedProvider.error, null);
  const enabledPortal = await customers.grantPortalAccess(
    orgId,
    portalTarget.id,
    { email: portalEmail },
    fixture.manager.id,
  );
  assert.equal(enabledPortal.authUserId, portal.authUserId);
  assert.equal(enabledPortal.portalAccessEnabled, true);
  checkpoint = 'document authorization and private storage';
  const documents = new DocumentsService(tenant, { get: (key) => config[key] });
  const listedBuckets = await staff.supabaseAdmin.storage.listBuckets();
  assert.equal(listedBuckets.error, null);
  const kycBucket = listedBuckets.data.find(
    (bucket) => bucket.id === 'kyc-documents',
  );
  if (!kycBucket) {
    const bucketResult = await staff.supabaseAdmin.storage.createBucket(
      'kyc-documents',
      {
        public: false,
        fileSizeLimit: 20971520,
        allowedMimeTypes: ['application/pdf', 'image/*'],
      },
    );
    assert.equal(bucketResult.error, null);
    createdKycBucket = true;
  } else assert.equal(kycBucket.public, false, 'KYC bucket must be private');
  const docDto = {
    relatedEntityType: 'customer',
    relatedEntityId: portalTarget.id,
    documentType: 'synthetic',
    fileName: 'Synthetic test.pdf',
  };
  const uploadGrant = await documents.getUploadUrl(
    orgId,
    fixture.admin.id,
    docDto,
  );
  storagePaths.add(uploadGrant.path);
  const storageClient = createClient(
    config.SUPABASE_URL,
    config.STAGING_PUBLIC_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const uploaded = await storageClient.storage
    .from('kyc-documents')
    .uploadToSignedUrl(
      uploadGrant.path,
      uploadGrant.token,
      Buffer.from('%PDF-1.4\nSynthetic disposable storage fixture\n%%EOF'),
      { contentType: 'application/pdf' },
    );
  assert.equal(uploaded.error, null);
  const registeredDoc = await documents.registerDocument(
    orgId,
    fixture.admin.id,
    {
      ...docDto,
      filePath: uploadGrant.path,
      mimeType: 'forged',
      fileSizeBytes: 1,
    },
  );
  assert.ok(registeredDoc.fileSizeBytes > 1n);
  assert.equal(registeredDoc.mimeType, 'application/pdf');
  await assert.rejects(
    documents.getSignedDownloadUrl(orgId, registeredDoc.id, created.id),
    (error) => error.getStatus() === 404,
  );
  const authorizedDownload = await documents.getSignedDownloadUrl(
    orgId,
    registeredDoc.id,
    fixture.manager.id,
  );
  const downloaded = await fetch(authorizedDownload.signedUrl, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(downloaded.status, 200);
  await downloaded.body?.cancel();
  await assert.rejects(
    documents.registerDocument(orgId, fixture.admin.id, {
      ...docDto,
      filePath: `foreign/customer/${portalTarget.id}/file.pdf`,
    }),
    (error) => error.getStatus() === 400,
  );
  await afterActorChange({ isActive: false }, (service) =>
    new DocumentsService(service.tenantPrisma, {
      get: (key) => config[key],
    }).getSignedDownloadUrl(orgId, registeredDoc.id, fixture.admin.id),
  );
  await prisma.staff.update({
    where: { id: fixture.admin.id },
    data: { isActive: true },
  });
  checkpoint = 'inactive self mutation denial';
  await prisma.staff.update({
    where: { id: created.id },
    data: { isActive: false },
  });
  await assert.rejects(
    notifications.subscribe(orgId, 'staff', created.id, subscription),
    (error) => error.getStatus() === 401,
  );
  await assert.rejects(
    staff.updateOwnPhone(orgId, created.id, '0000000006'),
    (error) => error.getStatus() === 403,
  );
  await assert.rejects(
    staff.update(orgId, created.id, {}, created.id),
    (error) => error.getStatus() === 403,
  );
  console.log(
    JSON.stringify({
      providerCreation: 'verified without invitation',
      documents:
        'private signed upload/registration/download verified; wrong agent/path/inactive actor denied',
      provisioningCompensation:
        'linked/in-flight attempts preserved; two workers delete one orphan',
      onboarding:
        'one concurrent organization; unfinished identity denied; demoted write denied',
      customerPortal:
        'one concurrent grant; revocation denies existing session and retains identity; reactivation reuses it',
      unfinishedProvisioning:
        'old unlinked attempts detected; fresh and linked identities preserved',
      orphanOnboarding: 'denied with actual provider session',
      databaseFailure: 'provider compensated',
      pushTakeover: 'rejected',
      sharedBrowserRebind: 'matching keys required',
      unsubscribe: 'owner only',
      unsafeEndpoint: 'rejected',
      inactiveSubscriber: 'denied',
      smsScope: 'mixed branch batch denied before delivery',
      staffRaces: 'overlapping actor deactivation and demotion deny mutations',
      reciprocalUpdates: 'both committed without deadlock',
      directoryRaces:
        'overlapping deactivation, demotion and branch move apply current scope',
      directoryScope:
        'manager filters cannot broaden access; administrator directory preserved',
      selfService:
        'own phone permitted; privilege escalation and inactive patches denied',
      data: 'synthetic only; no SMS or push sent',
    }),
  );
} catch {
  console.error(
    `Staging provisioning check failed at ${checkpoint}; no secrets or provider responses printed.`,
  );
  process.exitCode = 1;
} finally {
  try {
    if (seeded)
      await prisma.$transaction(
        async (tx) => {
          for (const createdOrgId of onboardingOrgIds) {
            await tx.staff.deleteMany({
              where: { organizationId: createdOrgId },
            });
            await tx.branch.deleteMany({
              where: { organizationId: createdOrgId },
            });
            await tx.organization.delete({ where: { id: createdOrgId } });
          }
          const owners = await tx.staff.findMany({
            where: { organizationId: orgId },
            select: { authUserId: true },
          });
          await tx.pushSubscription.deleteMany({
            where: {
              authUserId: { in: owners.map((owner) => owner.authUserId) },
            },
          });
          await tx.notification.deleteMany({
            where: { organizationId: orgId },
          });
          await tx.auditLog.deleteMany({ where: { organizationId: orgId } });
          await tx.customer.deleteMany({ where: { organizationId: orgId } });
          await tx.document.deleteMany({ where: { organizationId: orgId } });
          await tx.staff.deleteMany({ where: { organizationId: orgId } });
          await tx.branch.deleteMany({ where: { organizationId: orgId } });
          await tx.organization.delete({ where: { id: orgId } });
        },
        { timeout: 30000 },
      );
    for (const id of providerIds) {
      const result = await staff.supabaseAdmin.auth.admin.deleteUser(id);
      if (result.error) throw new Error('Synthetic provider cleanup failed');
    }
    if (storagePaths.size) {
      const removedStorage = await staff.supabaseAdmin.storage
        .from('kyc-documents')
        .remove([...storagePaths]);
      if (removedStorage.error)
        throw new Error('Synthetic object cleanup failed');
    }
    if (createdKycBucket) {
      const removedBucket =
        await staff.supabaseAdmin.storage.deleteBucket('kyc-documents');
      if (removedBucket.error)
        throw new Error('Synthetic bucket cleanup failed');
    }
    assert.equal(await prisma.organization.count({ where: { id: orgId } }), 0);
    console.log(
      'Synthetic provisioning fixtures and provider accounts removed.',
    );
  } catch {
    console.error('Synthetic provisioning cleanup needs attention.');
    process.exitCode = 1;
  }
  await prisma.$disconnect();
  await apiPrisma.onModuleDestroy();
}
