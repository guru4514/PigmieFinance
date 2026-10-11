import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStaging } from './staging.mjs';

const ref = 'abcdefghijklmnopqrst';
function config() {
  return {
    APP_ENV: 'staging',
    STAGING_PROJECT_REF: ref,
    SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_synthetic_test_only',
    DATABASE_URL: `postgresql://postgres.${ref}:dummy-test-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=synthetic-ca.crt`,
    DIRECT_URL: `postgresql://postgres:dummy-test-password@db.${ref}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict&sslcert=synthetic-ca.crt`,
    PII_ENCRYPTION_KEY: 'a'.repeat(64),
    CORS_ORIGIN: 'http://localhost:5174',
    PORT: '3001',
  };
}
test('isolated settings do not include notification credentials', () => {
  const validated = validateStaging({
    ...config(),
    SMTP_PASS: 'never-inherited',
    TWILIO_SID: 'never-inherited',
  });
  assert.equal(validated.SMTP_PASS, undefined);
  assert.equal(validated.TWILIO_SID, undefined);
});
test('current project and mixed database targets are rejected', () => {
  assert.throws(() =>
    validateStaging(config(), { SUPABASE_URL: config().SUPABASE_URL }),
  );
  assert.throws(() =>
    validateStaging({
      ...config(),
      STAGING_PROJECT_REF: 'yvxtkzxqaqkhyntdszcu',
    }),
  );
  assert.throws(() =>
    validateStaging({
      ...config(),
      DATABASE_URL: 'postgresql://postgres:dummy-test-password@production.test/postgres',
    }),
  );
});
test('transaction pooler cannot be used for migration status', () => {
  assert.throws(() =>
    validateStaging({ ...config(), DIRECT_URL: config().DATABASE_URL }),
  );
  assert.doesNotThrow(() =>
    validateStaging({
      ...config(),
      DIRECT_URL: config()
        .DATABASE_URL.replace(':6543/', ':5432/')
        .replace(
          'sslmode=verify-full&sslrootcert=',
          'sslmode=require&sslaccept=strict&sslcert=',
        ),
    }),
  );
});
test('unencrypted or unverified database connections are rejected', () => {
  assert.throws(() =>
    validateStaging({
      ...config(),
      DATABASE_URL: config().DATABASE_URL.replace('verify-full', 'disable'),
    }),
  );
  assert.throws(() =>
    validateStaging({
      ...config(),
      DIRECT_URL: config().DIRECT_URL.replace('strict', 'accept_invalid_certs'),
    }),
  );
});
test('reused encryption keys, service keys and incomplete examples are rejected', () => {
  assert.throws(() =>
    validateStaging(config(), {
      PII_ENCRYPTION_KEY: config().PII_ENCRYPTION_KEY,
    }),
  );
  assert.throws(() =>
    validateStaging(config(), {
      SUPABASE_SERVICE_ROLE_KEY: config().SUPABASE_SERVICE_ROLE_KEY,
    }),
  );
  assert.throws(() =>
    validateStaging({
      ...config(),
      SUPABASE_SERVICE_ROLE_KEY: 'REPLACE_WITH_STAGING_SERVICE_KEY',
    }),
  );
});
test('legacy service JWT must name this project and service role', () => {
  const jwt = (claims) =>
    `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
  assert.doesNotThrow(() =>
    validateStaging({
      ...config(),
      SUPABASE_SERVICE_ROLE_KEY: jwt({ ref, role: 'service_role' }),
    }),
  );
  assert.throws(() =>
    validateStaging({
      ...config(),
      SUPABASE_SERVICE_ROLE_KEY: jwt({
        ref: 'different',
        role: 'service_role',
      }),
    }),
  );
  assert.throws(() =>
    validateStaging({
      ...config(),
      SUPABASE_SERVICE_ROLE_KEY: jwt({ ref, role: 'anon' }),
    }),
  );
});
