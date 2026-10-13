import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import pg from 'pg';
import { digest } from './baseline-reconciliation.mjs';
import {
  exactHistory,
  priorNames,
  newNames,
} from './financial-evidence-migration.mjs';

// Compare existing row values after additive DDL without counting the new NULL
// columns as changes, or pretending the new migration registrations existed earlier.
let client;
try {
  assert.equal(process.argv.length, 3);
  assert.match(process.argv[2], /^backup-[a-f0-9-]{36}$/);
  const root = realpathSync(
    fileURLToPath(new URL('../../.recovery/', import.meta.url)),
  );
  const backup = realpathSync(resolve(root, process.argv[2]));
  assert.ok(backup.startsWith(root + sep));
  const proof = JSON.parse(
    readFileSync(resolve(backup, 'verification.json'), 'utf8'),
  );
  const age = Date.now() - new Date(proof.verifiedAt).getTime();
  assert.ok(
    proof.source === 'development' &&
      proof.restoreVerified &&
      proof.archivedHistoryRestored &&
      proof.financialEvidenceRehearsal &&
      age >= 0 &&
      age < 86400000,
  );
  const config = parse(readFileSync(new URL('../.env', import.meta.url)));
  assert.equal(config.SUPABASE_URL, 'https://yvxtkzxqaqkhyntdszcu.supabase.co');
  const url = new URL(config.DIRECT_URL);
  assert.ok(
    ['postgres:', 'postgresql:'].includes(url.protocol) && url.password,
  );
  assert.ok(
    url.hostname === 'db.yvxtkzxqaqkhyntdszcu.supabase.co' ||
      (url.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(url.username) === 'postgres.yvxtkzxqaqkhyntdszcu' &&
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
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await exactHistory(client, [...priorNames, ...newNames]);
  assert.equal(
    (
      await client.query(
        'SELECT count(*)::int AS count FROM public.loan_amendments',
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await client.query(
        'SELECT count(*)::int AS count FROM public.loan_schedule WHERE paid_principal IS NOT NULL OR paid_interest IS NOT NULL OR paid_fees IS NOT NULL',
      )
    ).rows[0].count,
    0,
  );
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','loan_amendments') ORDER BY tablename",
    )
  ).rows;
  const evidence = [];
  for (const { tablename } of tables) {
    const name = '"' + tablename.replaceAll('"', '""') + '"';
    const projection =
      tablename === 'loan_schedule'
        ? "to_jsonb(t)-'paid_principal'-'paid_interest'-'paid_fees'"
        : 'to_jsonb(t)';
    const row = (
      await client.query(
        `SELECT count(*)::text AS count,md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS digest FROM (SELECT md5((${projection})::text) AS row_hash FROM public.${name} t) hashes`,
      )
    ).rows[0];
    evidence.push({ table: tablename, ...row });
  }
  assert.equal(
    digest(evidence),
    proof.financialMigrationSourceEvidence.dataDigest,
  );
  const archived = (
    await client.query(
      'SELECT * FROM pigmie_migration_evidence.original_history ORDER BY id',
    )
  ).rows;
  assert.equal(
    digest(archived),
    proof.financialMigrationSourceEvidence.archivedDigest,
  );
  const oldHistory = (
    await client.query(
      'SELECT * FROM public._prisma_migrations WHERE migration_name=ANY($1) ORDER BY id',
      [priorNames],
    )
  ).rows;
  assert.equal(
    digest(oldHistory),
    proof.financialMigrationSourceEvidence.historyDigest,
  );
  await client.query('ROLLBACK');
  console.log(
    JSON.stringify({
      environment: 'development',
      postDeploymentOriginalRows: 'exact match',
      existingMigrationHistory: 'exact match',
      archivedMigrationHistory: 'exact match',
      historicalComponents: 'remain unknown',
      historicalAmendments: 'not fabricated',
    }),
  );
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    'Post-deployment financial data verification failed; secrets and provider diagnostics suppressed.',
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
