import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStaging, stagingProcessEnvironment } from './staging.mjs';
const ref = 'abcdefghijklmnopqrst';
const operator = `postgresql://postgres.${ref}:dummy-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=dummy-ca`;
const restricted = operator.replace(`postgres.${ref}`, `pigmie_runtime.${ref}`);
function config() {
  return {
    APP_ENV: 'staging',
    STAGING_PROJECT_REF: ref,
    SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_dummy_placeholder',
    DATABASE_URL: operator,
    DIRECT_URL: operator
      .replace(':6543', ':5432')
      .replace(
        'sslmode=verify-full&sslrootcert=dummy-ca',
        'sslmode=require&sslaccept=strict&sslcert=dummy-ca',
      ),
    PII_ENCRYPTION_KEY: '1'.repeat(64),
    CORS_ORIGIN: 'http://localhost:5174',
    PORT: '3001',
  };
}
test('maintenance can validate before runtime provisioning, but API startup cannot', () => {
  const valid = validateStaging(config());
  assert.throws(
    () => stagingProcessEnvironment(valid, 'start'),
    /restricted staging runtime/,
  );
  assert.equal(
    stagingProcessEnvironment(valid, 'status').DIRECT_URL,
    valid.DIRECT_URL,
  );
});
test('runtime validation rejects operator, foreign-project, insecure TLS and placeholder connections', () => {
  for (const value of [
    operator,
    restricted.replace(ref, 'zyxwvutsrqponmlkjihg'),
    restricted.replace('verify-full', 'disable'),
    restricted.replace('dummy-password', 'REPLACE_WITH_PASSWORD'),
  ])
    assert.throws(
      () => validateStaging({ ...config(), RUNTIME_DATABASE_URL: value }),
      /Runtime connection/,
    );
  assert.equal(
    validateStaging({ ...config(), RUNTIME_DATABASE_URL: restricted })
      .RUNTIME_DATABASE_URL,
    restricted,
  );
});
test('API environment excludes maintenance and ambient credentials and combined dotenv file', () => {
  const valid = validateStaging({
    ...config(),
    RUNTIME_DATABASE_URL: restricted,
  });
  const env = stagingProcessEnvironment(valid, 'start', {
    PATH: 'dummy-path',
    DATABASE_URL: 'ambient-dummy-owner',
    DIRECT_URL: 'ambient-dummy-direct',
    DOTENV_CONFIG_PATH: 'dummy-maintenance-file',
    UNRELATED_SECRET: 'dummy',
  });
  assert.equal(env.RUNTIME_DATABASE_URL, restricted);
  assert.equal(env.PATH, 'dummy-path');
  for (const key of [
    'DATABASE_URL',
    'DIRECT_URL',
    'DOTENV_CONFIG_PATH',
    'UNRELATED_SECRET',
  ])
    assert.equal(key in env, false);
  assert.equal(env.APP_ENV, 'staging');
});
test('browser environment receives public settings only; maintenance omits API secrets', () => {
  const valid = validateStaging({
    ...config(),
    RUNTIME_DATABASE_URL: restricted,
  });
  const browser = stagingProcessEnvironment(
    valid,
    'web',
    {},
    {
      VITE_SUPABASE_URL: 'https://example.test',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_dummy',
      VITE_API_URL: 'http://localhost:3001',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_dummy',
    },
  );
  for (const key of [
    'DATABASE_URL',
    'DIRECT_URL',
    'RUNTIME_DATABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PII_ENCRYPTION_KEY',
    'DOTENV_CONFIG_PATH',
  ])
    assert.equal(key in browser, false);
  const maintenance = stagingProcessEnvironment(valid, 'diff');
  for (const key of [
    'RUNTIME_DATABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PII_ENCRYPTION_KEY',
  ])
    assert.equal(key in maintenance, false);
});
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
      DATABASE_URL:
        'postgresql://postgres:dummy-test-password@production.test/postgres',
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
