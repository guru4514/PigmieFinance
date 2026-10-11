import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { generate } from 'otplib';
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
const prisma = new PrismaService();
const options = {
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const admin = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const auth = createClient(
  config.SUPABASE_URL,
  config.STAGING_PUBLIC_KEY,
  options,
);
const orgId = randomUUID();
let userId, staffId;
let orgCreated = false;
let checkpoint = 'provider account';
const request = async (token, path) => {
  const response = await fetch(`http://127.0.0.1:3001/api/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  await response.body?.cancel();
  return response;
};
try {
  const email = `staging-check-${randomUUID()}@example.test`;
  const password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('Synthetic provider account creation failed.');
  userId = created.data.user.id;
  await prisma.organization.create({
    data: { id: orgId, name: 'Synthetic live MFA check' },
  });
  orgCreated = true;
  const staff = await prisma.staff.create({
    data: {
      organizationId: orgId,
      authUserId: userId,
      role: 'org_admin',
      fullName: 'Synthetic MFA admin',
      email,
    },
  });
  staffId = staff.id;
  checkpoint = 'first-factor API denial';
  const signed = await auth.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session)
    throw new Error('Synthetic sign-in failed.');
  const firstToken = signed.data.session.access_token;
  assert.equal((await request(firstToken, 'staff')).status, 403);
  assert.equal((await request(firstToken, 'auth/me')).status, 200);
  checkpoint = 'provider MFA enrollment';
  const enrolled = await auth.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Synthetic staging check',
  });
  if (enrolled.error || !enrolled.data?.totp)
    throw new Error('Synthetic factor enrollment failed.');
  const code = await generate({ secret: enrolled.data.totp.secret });
  const verified = await auth.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code,
  });
  if (verified.error) throw new Error('Synthetic factor verification failed.');
  checkpoint = 'second-factor API acceptance';
  const session = await auth.auth.getSession();
  assert.ok(session.data.session);
  const secondToken = session.data.session.access_token;
  assert.equal((await request(secondToken, 'staff')).status, 200);
  // A still-valid first-factor token remains insufficient after enrollment.
  assert.equal((await request(firstToken, 'staff')).status, 403);
  checkpoint = 'inactive staff denial';
  await prisma.staff.update({
    where: { id: staffId },
    data: { isActive: false },
  });
  assert.equal((await request(secondToken, 'staff')).status, 401);
  await prisma.staff.update({
    where: { id: staffId },
    data: { isActive: true },
  });
  const otherDevice = createClient(
    config.SUPABASE_URL,
    config.STAGING_PUBLIC_KEY,
    options,
  );
  const otherSigned = await otherDevice.auth.signInWithPassword({
    email,
    password,
  });
  if (otherSigned.error || !otherSigned.data.session)
    throw new Error('Other synthetic session failed.');
  const otherToken = otherSigned.data.session.access_token;
  assert.equal((await request(otherToken, 'auth/me')).status, 200);
  checkpoint = 'global sign-out revocation';
  const refreshToken = session.data.session.refresh_token;
  const signedOut = await auth.auth.signOut({ scope: 'global' });
  if (signedOut.error) throw new Error('Synthetic sign-out failed.');
  const revokedRefresh = await auth.auth.refreshSession({
    refresh_token: refreshToken,
  });
  assert.ok(revokedRefresh.error);
  const revokedStatus = (await request(secondToken, 'staff')).status;
  console.log(
    JSON.stringify({
      checkpoint,
      refreshRejected: true,
      revokedAccessStatus: revokedStatus,
    }),
  );
  assert.equal(revokedStatus, 401);
  assert.equal((await request(otherToken, 'auth/me')).status, 401);
  checkpoint = 'lost-device recovery';
  // Trusted operator recovery: remove the lost factor, revoke sessions, require fresh enrollment.
  const signedAgain = await auth.auth.signInWithPassword({ email, password });
  if (signedAgain.error || !signedAgain.data.session)
    throw new Error('Synthetic recovery sign-in failed.');
  const oldFactorVerified = await auth.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: await generate({ secret: enrolled.data.totp.secret }),
  });
  if (oldFactorVerified.error)
    throw new Error('Synthetic factor re-verification failed.');
  const beforeRecovery = await auth.auth.getSession();
  assert.ok(beforeRecovery.data.session);
  const recoveryToken = beforeRecovery.data.session.access_token;
  const removed = await admin.auth.admin.mfa.deleteFactor({
    userId,
    id: enrolled.data.id,
  });
  if (removed.error) throw new Error('Synthetic lost-factor deletion failed.');
  assert.ok(
    [401, 403].includes((await request(recoveryToken, 'staff')).status),
  );
  const recoverySignOut = await admin.auth.admin.signOut(
    recoveryToken,
    'global',
  );
  if (recoverySignOut.error)
    throw new Error('Synthetic recovery session revocation failed.');
  assert.equal((await request(recoveryToken, 'auth/me')).status, 401);
  const freshAuth = createClient(
    config.SUPABASE_URL,
    config.STAGING_PUBLIC_KEY,
    options,
  );
  const recovered = await freshAuth.auth.signInWithPassword({
    email,
    password,
  });
  if (recovered.error || !recovered.data.session)
    throw new Error('Fresh synthetic recovery sign-in failed.');
  assert.equal(
    (await request(recovered.data.session.access_token, 'staff')).status,
    403,
  );
  assert.equal(
    (await request(recovered.data.session.access_token, 'auth/me')).status,
    200,
  );
  const lostChallenge = await freshAuth.auth.mfa.challenge({
    factorId: enrolled.data.id,
  });
  assert.ok(lostChallenge.error);
  const replacement = await freshAuth.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Synthetic recovered factor',
  });
  if (replacement.error || !replacement.data?.totp)
    throw new Error('Synthetic recovery enrollment failed.');
  const reverified = await freshAuth.auth.mfa.challengeAndVerify({
    factorId: replacement.data.id,
    code: await generate({ secret: replacement.data.totp.secret }),
  });
  if (reverified.error)
    throw new Error('Synthetic recovery verification failed.');
  const recoveredSession = await freshAuth.auth.getSession();
  assert.ok(recoveredSession.data.session);
  assert.equal(
    (await request(recoveredSession.data.session.access_token, 'staff')).status,
    200,
  );
  checkpoint = 'deleted provider identity denial';
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) throw new Error('Synthetic provider deletion failed.');
  userId = undefined;
  assert.equal(
    (await request(recoveredSession.data.session.access_token, 'auth/me'))
      .status,
    401,
  );
  console.log(
    JSON.stringify({
      project: config.STAGING_PROJECT_REF,
      firstFactor: 'protected API denied; bootstrap allowed',
      secondFactor: 'protected API accepted',
      oldFirstFactor: 'still denied',
      inactiveStaff: 'denied',
      globalSignOut: 'both devices denied; refresh rejected',
      recovery:
        'lost factor rejected; fresh enrollment required; access restored',
      deletedIdentity: 'denied before application onboarding',
      account: 'synthetic; no invitation email',
    }),
  );
} catch {
  console.error(
    `Live staging MFA check failed at ${checkpoint}; no passwords, tokens or enrollment secrets printed.`,
  );
  process.exitCode = 1;
} finally {
  try {
    if (orgCreated)
      await prisma.$transaction(
        async (tx) => {
          await tx.auditLog.deleteMany({ where: { organizationId: orgId } });
          await tx.staff.deleteMany({ where: { organizationId: orgId } });
          await tx.organization.delete({ where: { id: orgId } });
        },
        { timeout: 30000 },
      );
    if (userId) {
      const result = await admin.auth.admin.deleteUser(userId);
      if (result.error) throw new Error('Synthetic provider cleanup failed.');
    }
    console.log(
      'Synthetic MFA provider account and database fixtures removed.',
    );
  } catch {
    console.error('Synthetic MFA cleanup needs attention.');
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}
