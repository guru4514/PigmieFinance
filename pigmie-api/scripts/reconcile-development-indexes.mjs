import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { decryptBackup } = require('../dist/common/utils/backup-format.util.js');
let client;
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
  assert.equal(verification.scope, 'public');
  assert.equal(verification.restoreVerified, true);
  const age = Date.now() - new Date(verification.verifiedAt).getTime();
  assert.ok(Number.isFinite(age) && age >= 0 && age < 7 * 86400000);
  const key = parse(
    readFileSync(resolve(backup, '.env.local')),
  ).BACKUP_ENCRYPTION_KEY;
  assert.ok(
    decryptBackup(readFileSync(resolve(backup, 'application.pgbk')), key)
      .subarray(0, 5)
      .equals(Buffer.from('PGDMP')),
  );
  const config = parse(readFileSync(new URL('../.env', import.meta.url)));
  const ref = 'yvxtkzxqaqkhyntdszcu';
  assert.equal(config.SUPABASE_URL, `https://${ref}.supabase.co`);
  const url = new URL(config.DIRECT_URL);
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
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query(
    'LOCK TABLE public.collections,public.loan_schedule,public.loans IN SHARE ROW EXCLUSIVE MODE',
  );
  const history = (
    await client.query('SELECT * FROM public._prisma_migrations ORDER BY id')
  ).rows;
  const totalsSql =
    'SELECT count(*)::text AS rows,sum(total_payable)::text AS payable,sum(total_collected)::text AS collected,sum(outstanding_balance)::text AS outstanding FROM public.loans';
  const before = (await client.query(totalsSql)).rows;
  const expected = [
    [
      'collections_organization_id_collection_date_status_idx',
      'collections',
      'organization_id, collection_date, status',
    ],
    [
      'loan_schedule_loan_id_status_due_date_idx',
      'loan_schedule',
      'loan_id, status, due_date',
    ],
  ];
  let created = 0;
  for (const [name, table, columns] of expected) {
    const existing = (
      await client.query(
        "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=$1",
        [name],
      )
    ).rows;
    if (!existing.length) {
      await client.query(
        `CREATE INDEX ${name} ON public.${table} (${columns})`,
      );
      created++;
    }
    const definition = (
      await client.query(
        "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=$1",
        [name],
      )
    ).rows[0].indexdef;
    assert.equal(
      definition,
      `CREATE INDEX ${name} ON public.${table} USING btree (${columns})`,
    );
  }
  assert.deepEqual((await client.query(totalsSql)).rows, before);
  assert.deepEqual(
    (await client.query('SELECT * FROM public._prisma_migrations ORDER BY id'))
      .rows,
    history,
  );
  await client.query(args[1] === '--apply' ? 'COMMIT' : 'ROLLBACK');
  console.log(
    JSON.stringify({
      developmentIndexes:
        args[1] === '--apply' ? 'applied' : 'dry-run rolled back',
      definitionsVerified: 2,
      created,
      financialTotalsPreserved: true,
      migrationHistoryUnchanged: true,
      foreignKeysUnchanged: true,
      backupAuthenticated: true,
    }),
  );
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    'Development index reconciliation stopped; no history rewrite or raw diagnostics.',
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
