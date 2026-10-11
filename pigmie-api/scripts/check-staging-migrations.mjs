import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

const config = parse(readFileSync(new URL('../.env.staging', import.meta.url)));
const runtime = parse(readFileSync(new URL('../.env', import.meta.url)));
validateStaging(config, runtime);
const direct = new URL(config.DIRECT_URL);
for (const parameter of [
  'sslmode',
  'sslaccept',
  'sslcert',
  'sslrootcert',
  'sslkey',
])
  direct.searchParams.delete(parameter);
const client = new pg.Client({
  connectionString: direct.toString(),
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(
      new URL('../prisma/supabase-ca.crt', import.meta.url),
      'utf8',
    ),
  },
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
});
const migration = (name) =>
  readFileSync(
    new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
    'utf8',
  );
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  const before = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  assert.equal(
    before.rowCount,
    0,
    'Dry-run requires the verified empty staging database.',
  );
  await client.query(migration('0001_init'));
  const compatibility = migration('0002_staff_totp_secret');
  await client.query('SAVEPOINT compatibility');
  await client.query(compatibility);
  let columns = await client.query(
    "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name='two_factor_secret'",
  );
  assert.equal(columns.rows[0]?.data_type, 'text');
  await client.query('ROLLBACK TO SAVEPOINT compatibility');
  await client.query(
    'ALTER TABLE public.staff ADD COLUMN two_factor_secret text',
  );
  await client.query(compatibility);
  await client.query('ROLLBACK TO SAVEPOINT compatibility');
  await client.query(
    'ALTER TABLE public.staff ADD COLUMN two_factor_secret bytea',
  );
  const org = (
    await client.query(
      "INSERT INTO public.organizations(name) VALUES ('Synthetic migration check') RETURNING id",
    )
  ).rows[0].id;
  await client.query(
    "INSERT INTO public.staff(organization_id,auth_user_id,full_name,email,role,two_factor_secret) VALUES ($1,gen_random_uuid(),'Synthetic','synthetic@example.test','org_admin',decode('000102ff','hex'))",
    [org],
  );
  await client.query(compatibility);
  const converted = await client.query(
    'SELECT two_factor_secret FROM public.staff',
  );
  assert.equal(converted.rows[0].two_factor_secret, '\\x000102ff');
  await client.query('ROLLBACK TO SAVEPOINT compatibility');
  await client.query(compatibility);
  const alignment = migration('0003_align_application_schema')
    .replace(/^BEGIN;\s*$/m, '')
    .replace(/^COMMIT;\s*$/m, '');
  await client.query(alignment);
  const tables = await client.query(
    "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  assert.equal(tables.rowCount, 14);
  assert.ok(tables.rows.every((table) => table.rowsecurity));
  for (const role of ['anon', 'authenticated']) {
    for (const table of tables.rows) {
      const grants = await client.query(
        "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') AS allowed",
        [role, `public.${table.tablename}`],
      );
      assert.equal(
        grants.rows[0].allowed,
        false,
        `${role} must not bypass the API on ${table.tablename}`,
      );
    }
  }
  columns = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='kyc_status'",
  );
  assert.equal(columns.rowCount, 1);
  await client.query('ROLLBACK');
  const after = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );
  assert.equal(
    after.rowCount,
    0,
    'Dry-run must leave no application tables or records.',
  );
  console.log(
    JSON.stringify({
      project: config.STAGING_PROJECT_REF,
      migrations: 'dry-run passed',
      totpVariants: ['missing', 'text', 'bytea'],
      appTables: 14,
      rlsEnabled: true,
      directClientPrivileges: false,
      rollbackVerified: true,
    }),
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : 'CHECK_FAILED';
  console.error(
    `Staging migration dry-run failed (${code}); no credentials printed.`,
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
