import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

// Rehearse the identified drift in a disposable schema; never alter development.
let client;
let checkpoint = 'configuration';
const schema = `rehearsal_${randomUUID().replaceAll('-', '')}`;
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
try {
  const config = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(
    config,
    parse(readFileSync(new URL('../.env', import.meta.url))),
  );
  assert.equal(config.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
  const url = new URL(config.DIRECT_URL);
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
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query(`CREATE SCHEMA ${quote(schema)}`);
  await client.query(`SET LOCAL search_path TO ${quote(schema)}, public`);
  for (const name of [
    '0001_init',
    '0002_staff_totp_secret',
    '0003_align_application_schema',
    '0004_financial_query_indexes',
  ]) {
    checkpoint = name;
    const sql = readFileSync(
      new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
      'utf8',
    )
      // The legacy migration creates a cluster-wide role. A schema rehearsal
      // must never create, alter or grant privileges to that shared role.
      .replace(
        /-- Role Setup[\s\S]*?-- RLS Helper Functions/,
        '-- RLS Helper Functions',
      )
      .replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')
      .replace(/\bpublic\./g, `${quote(schema)}.`)
      .replace(/'public'/g, `'${schema}'`)
      .replace(
        /set search_path = public/gi,
        `set search_path = ${quote(schema)}`,
      );
    assert.ok(!/\b(create|alter)\s+role\b/i.test(sql));
    await client.query(sql);
  }
  const catalog = async () => {
    const constraints = await client.query(
      `SELECT c.relname AS table_name,p.conname AS name,pg_get_constraintdef(p.oid) AS definition
      FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname,p.conname`,
      [schema],
    );
    const indexes = await client.query(
      'SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname',
      [schema],
    );
    return { constraints: constraints.rows, indexes: indexes.rows };
  };
  const expected = await catalog();
  checkpoint = 'synthetic balances';
  const org = (
    await client.query(
      "INSERT INTO organizations(name) VALUES ('Synthetic reconciliation') RETURNING id",
    )
  ).rows[0].id;
  const customer = (
    await client.query(
      "INSERT INTO customers(organization_id,full_name,phone) VALUES ($1,'Synthetic','synthetic') RETURNING id",
      [org],
    )
  ).rows[0].id;
  const product = (
    await client.query(
      "INSERT INTO loan_products(organization_id,name,interest_type,interest_rate_annual,collection_frequency,min_amount,max_amount,min_tenure,max_tenure) VALUES ($1,'Synthetic','flat',12,'daily',1,1000,1,30) RETURNING id",
      [org],
    )
  ).rows[0].id;
  const loan = (
    await client.query(
      "INSERT INTO loans(organization_id,customer_id,loan_product_id,loan_code,principal_amount,interest_type,interest_rate_annual,collection_frequency,tenure,installment_amount,total_payable,outstanding_balance,status) VALUES ($1,$2,$3,'SYNTHETIC',100,'flat',12,'daily',1,110,110,110,'active') RETURNING id",
      [org, customer, product],
    )
  ).rows[0].id;
  await client.query(
    "INSERT INTO loan_schedule(loan_id,installment_number,due_date,principal_component,interest_component,due_amount,paid_amount,status) VALUES ($1,1,'2026-10-01',100,10,110,55,'partially_paid')",
    [loan],
  );
  const balances = async () =>
    (
      await client.query(
        'SELECT total_payable::text,outstanding_balance::text,(SELECT sum(paid_amount)::text FROM loan_schedule) AS allocated FROM loans',
      )
    ).rows;
  const before = await balances();
  checkpoint = 'simulate known drift';
  const foreignKeys = (
    await client.query(
      `SELECT c.relname AS table_name,p.conname AS name,pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p
    JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND p.contype='f' AND p.confupdtype='a' ORDER BY c.relname,p.conname`,
      [schema],
    )
  ).rows;
  assert.equal(foreignKeys.length, 30);
  for (const key of foreignKeys) {
    const definition = key.definition.replace(
      / ON DELETE /,
      ' ON UPDATE CASCADE ON DELETE ',
    );
    assert.ok(definition.includes('ON UPDATE CASCADE'));
    await client.query(
      `ALTER TABLE ${quote(schema)}.${quote(key.table_name)} DROP CONSTRAINT ${quote(key.name)}, ADD CONSTRAINT ${quote(key.name)} ${definition}`,
    );
  }
  const missing = [
    'collections_organization_id_collection_date_status_idx',
    'loan_schedule_loan_id_status_due_date_idx',
  ];
  for (const name of missing)
    await client.query(`DROP INDEX ${quote(schema)}.${quote(name)}`);
  const renamed = expected.indexes.filter(
    (row) =>
      !missing.includes(row.indexname) &&
      !row.indexdef.startsWith('CREATE UNIQUE'),
  );
  for (const row of renamed)
    await client.query(
      `ALTER INDEX ${quote(schema)}.${quote(row.indexname)} RENAME TO ${quote('drift_' + row.indexname)}`,
    );
  assert.notDeepEqual(await catalog(), expected);
  checkpoint = 'reconcile disposable representation';
  for (const key of foreignKeys)
    await client.query(
      `ALTER TABLE ${quote(schema)}.${quote(key.table_name)} DROP CONSTRAINT ${quote(key.name)}, ADD CONSTRAINT ${quote(key.name)} ${key.definition}`,
    );
  for (const row of renamed)
    await client.query(
      `ALTER INDEX ${quote(schema)}.${quote('drift_' + row.indexname)} RENAME TO ${quote(row.indexname)}`,
    );
  for (const row of expected.indexes.filter((row) =>
    missing.includes(row.indexname),
  ))
    await client.query(row.indexdef);
  assert.deepEqual(await catalog(), expected);
  assert.deepEqual(await balances(), before);
  for (const role of ['anon', 'authenticated']) {
    const privileges = await client.query(
      "SELECT bool_or(has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE')) AS permitted FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2 AND c.relkind='r'",
      [role, schema],
    );
    assert.equal(privileges.rows[0].permitted, false);
  }
  await client.query('ROLLBACK');
  assert.equal(
    (
      await client.query(
        'SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1',
        [schema],
      )
    ).rows[0].count,
    0,
  );
  console.log(
    JSON.stringify({
      rehearsal: 'passed',
      foreignKeyUpdateCorrections: foreignKeys.length,
      indexDefinitionsRestored: 2,
      indexNamesRestored: renamed.length,
      syntheticBalancesPreserved: true,
      directClientPrivilegesDenied: true,
      rollbackVerified: true,
      developmentChanged: false,
      limit:
        'Simulates identified drift; does not reconstruct the unknown historical migration or compare every development policy/function.',
    }),
  );
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : 'CHECK_FAILED';
  const position = /^\d+$/.test(error?.position ?? '')
    ? error.position
    : 'unavailable';
  console.error(
    `Schema rehearsal failed at ${checkpoint} (${code}, position ${position}); credentials and SQL diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
