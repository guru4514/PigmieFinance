import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

let client;
try {
  const args = process.argv.slice(2);
  const dev = args[0] === '--development';
  assert.ok(
    dev ? args.length === 2 : args.length === 1 && args[0] === '--staging',
  );
  const development = parse(readFileSync(new URL('../.env', import.meta.url)));
  const staging = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(staging, development);
  assert.equal(
    development.SUPABASE_URL,
    'https://yvxtkzxqaqkhyntdszcu.supabase.co',
  );
  assert.equal(staging.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
  if (dev) {
    assert.match(args[1], /^backup-[a-f0-9-]{36}$/);
    const root = realpathSync(
      fileURLToPath(new URL('../../.recovery/', import.meta.url)),
    );
    const backup = realpathSync(resolve(root, args[1]));
    assert.ok(backup.startsWith(root + sep));
    const proof = JSON.parse(
      readFileSync(resolve(backup, 'verification.json'), 'utf8'),
    );
    const age = Date.now() - new Date(proof.verifiedAt).getTime();
    assert.ok(
      proof.source === 'development' &&
        proof.restoreVerified === true &&
        proof.archivedHistoryRestored === true &&
        Number.isFinite(age) &&
        age >= 0 &&
        age < 86400000,
    );
    const require = createRequire(import.meta.url);
    const {
      decryptBackup,
    } = require('../dist/common/utils/backup-format.util.js');
    const key = parse(
      readFileSync(resolve(backup, '.env.local')),
    ).BACKUP_ENCRYPTION_KEY;
    assert.ok(
      decryptBackup(readFileSync(resolve(backup, 'application.pgbk')), key)
        .subarray(0, 5)
        .equals(Buffer.from('PGDMP')),
    );
  }
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  if (!dev) {
    const rehearsal = spawnSync(
      process.execPath,
      ['scripts/check-financial-contract-migration.mjs'],
      { cwd, stdio: 'inherit', timeout: 60000, windowsHide: true },
    );
    assert.equal(rehearsal.status, 0);
  }
  const config = dev ? development : staging;
  const url = new URL(config.DIRECT_URL);
  const ref = dev ? 'yvxtkzxqaqkhyntdszcu' : 'sjelnxrlkrvwjcgqbvre';
  assert.ok(
    url.hostname === `db.${ref}.supabase.co` ||
      (url.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(url.username) === `postgres.${ref}` &&
        url.port === '5432'),
  );
  assert.equal(url.pathname, '/postgres');
  for (const key of [
    'sslmode',
    'sslaccept',
    'sslcert',
    'sslrootcert',
    'sslkey',
  ])
    url.searchParams.delete(key);
  client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL('../prisma/supabase-ca.crt', import.meta.url),
        'utf8',
      ),
    },
  });
  await client.connect();
  const history = (
    await client.query(
      'SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
    )
  ).rows.map((row) => row.migration_name);
  assert.deepEqual(history, [
    '0001_init',
    '0002_staff_totp_secret',
    '0003_align_application_schema',
    '0004_financial_query_indexes',
  ]);
  if (dev) {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query(
      readFileSync(
        new URL(
          '../prisma/migrations/0005_financial_contract_evidence/migration.sql',
          import.meta.url,
        ),
        'utf8',
      )
        .replace(/^BEGIN;\s*$/m, '')
        .replace(/^COMMIT;\s*$/m, ''),
    );
    await client.query('ROLLBACK');
  }
  await client.end();
  client = undefined;
  const system = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      [
        'PATH',
        'SYSTEMROOT',
        'WINDIR',
        'TEMP',
        'TMP',
        'USERPROFILE',
        'APPDATA',
        'LOCALAPPDATA',
        'COMSPEC',
        'PATHEXT',
      ].includes(key.toUpperCase()),
    ),
  );
  const deploy = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd,
      env: {
        ...system,
        DIRECT_URL: config.DIRECT_URL,
        DATABASE_URL: config.DATABASE_URL,
        DOTENV_CONFIG_PATH: fileURLToPath(
          new URL(dev ? '../.env' : '../.env.staging', import.meta.url),
        ),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
      windowsHide: true,
    },
  );
  assert.equal(deploy.status, 0);
  console.log(
    JSON.stringify({
      environment: dev ? 'development' : 'staging',
      financialContractMigration: 'deployed by Prisma',
      providerDiagnosticsSuppressed: true,
    }),
  );
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    'Financial contract deployment stopped; raw credentials and provider diagnostics suppressed. Verify migration status before retry.',
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
