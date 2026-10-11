import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

const config = parse(readFileSync(new URL('../.env.staging', import.meta.url)));
validateStaging(
  config,
  parse(readFileSync(new URL('../.env', import.meta.url))),
);
assert.equal(config.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
const direct = new URL(config.DIRECT_URL);
for (const key of ['sslmode', 'sslaccept', 'sslcert', 'sslrootcert', 'sslkey'])
  direct.searchParams.delete(key);
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
try {
  await client.connect();
  await client.query('BEGIN');
  const history = await client.query(
    'SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
  );
  assert.deepEqual(
    history.rows.map((row) => row.migration_name),
    ['0001_init', '0002_staff_totp_secret', '0003_align_application_schema'],
  );
  const sql = readFileSync(
    new URL(
      '../prisma/migrations/0004_financial_query_indexes/migration.sql',
      import.meta.url,
    ),
    'utf8',
  )
    .replace(/^BEGIN;\s*$/m, '')
    .replace(/^COMMIT;\s*$/m, '');
  assert.equal((sql.match(/CREATE INDEX/g) || []).length, 2);
  assert.ok(!/DROP|DELETE|UPDATE|ALTER/i.test(sql));
  await client.query(sql);
  const indexes = await client.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('collections_organization_id_collection_date_status_idx','loan_schedule_loan_id_status_due_date_idx')",
  );
  assert.equal(indexes.rowCount, 2);
  await client.query('ROLLBACK');
  const after = await client.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('collections_organization_id_collection_date_status_idx','loan_schedule_loan_id_status_due_date_idx')",
  );
  assert.equal(after.rowCount, 0);
  console.log(
    'Two staging indexes passed transactional creation and rollback checks.',
  );
} catch {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Staging index verification failed; no credentials printed.');
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
