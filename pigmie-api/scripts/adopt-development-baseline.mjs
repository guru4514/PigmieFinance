import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import pg from 'pg';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';
import {
  baselineCatalog,
  dataEvidence,
  digest,
  migrationEvidence,
  reconcileBaseline,
} from './baseline-reconciliation.mjs';

const require = createRequire(import.meta.url);
const { decryptBackup } = require('../dist/common/utils/backup-format.util.js');
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
let source, canonical;
let checkpoint = 'configuration';
try {
  const args = process.argv.slice(2);
  assert.ok(args.length === 1 || (args.length === 2 && args[1] === '--apply'));
  assert.match(args[0], /^backup-[a-f0-9-]{36}$/);
  const root = realpathSync(
    fileURLToPath(new URL('../../.recovery/', import.meta.url)),
  );
  const backup = realpathSync(resolve(root, args[0]));
  assert.ok(backup.startsWith(root + sep));
  const verification = JSON.parse(
    readFileSync(resolve(backup, 'verification.json'), 'utf8'),
  );
  assert.equal(verification.source, 'development');
  assert.equal(verification.restoreVerified, true);
  assert.equal(verification.baselineVerification?.verified, true);
  const age = Date.now() - new Date(verification.verifiedAt).getTime();
  assert.ok(Number.isFinite(age) && age >= 0 && age < 86400000);
  const key = parse(
    readFileSync(resolve(backup, '.env.local')),
  ).BACKUP_ENCRYPTION_KEY;
  assert.ok(
    decryptBackup(readFileSync(resolve(backup, 'application.pgbk')), key)
      .subarray(0, 5)
      .equals(Buffer.from('PGDMP')),
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
  const connection = new URL(development.DIRECT_URL);
  assert.ok(
    connection.hostname === 'db.yvxtkzxqaqkhyntdszcu.supabase.co' ||
      (connection.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(connection.username) ===
          'postgres.yvxtkzxqaqkhyntdszcu' &&
        connection.port === '5432'),
  );
  assert.equal(connection.pathname, '/postgres');
  const makeClient = (value) => {
    const url = new URL(value);
    for (const key of [
      'sslmode',
      'sslaccept',
      'sslcert',
      'sslrootcert',
      'sslkey',
    ])
      url.searchParams.delete(key);
    return new pg.Client({
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
  };
  source = makeClient(development.DIRECT_URL);
  canonical = makeClient(staging.DIRECT_URL);
  await source.connect();
  await canonical.connect();
  await canonical.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const expected = await baselineCatalog(canonical);
  const proof = verification.baselineVerification;
  assert.equal(digest(expected), proof.canonicalCatalogDigest);
  assert.equal(digest(migrationEvidence()), proof.migrationDigest);
  checkpoint = 'exclusive application-table locks';
  await source.query('BEGIN');
  await source.query("SET LOCAL lock_timeout='5s'");
  await source.query(
    "SELECT pg_advisory_xact_lock(hashtext('pigmie-development-baseline'))",
  );
  const tables = (
    await source.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  assert.equal(tables.length, verification.tablesCompared);
  await source.query(
    `LOCK TABLE ${tables.map(({ tablename }) => 'public.' + quote(tablename)).join(',')} IN ACCESS EXCLUSIVE MODE`,
  );
  checkpoint = 'rehearsal evidence comparison';
  assert.equal(
    digest(await baselineCatalog(source)),
    proof.sourceCatalogDigest,
  );
  assert.equal(digest(await dataEvidence(source)), proof.sourceDataDigest);
  assert.equal(
    digest(
      (
        await source.query(
          'SELECT * FROM public._prisma_migrations ORDER BY id',
        )
      ).rows,
    ),
    proof.sourceHistoryDigest,
  );
  checkpoint = 'baseline adoption';
  const result = await reconcileBaseline(source, expected);
  await source.query(args[1] === '--apply' ? 'COMMIT' : 'ROLLBACK');
  console.log(
    JSON.stringify({
      developmentBaseline:
        args[1] === '--apply' ? 'adopted' : 'dry-run rolled back',
      ...result,
      backupAuthenticated: true,
      exactRestoreRehearsalMatched: true,
      historicalSqlExecutionAsserted: false,
    }),
  );
} catch {
  await source?.query('ROLLBACK').catch(() => {});
  console.error(
    `Development baseline stopped at ${checkpoint}; credentials, rows and SQL diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await canonical?.query('ROLLBACK').catch(() => {});
  await source?.end().catch(() => {});
  await canonical?.end().catch(() => {});
}
