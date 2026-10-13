import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';
import { sourceEvidence } from './financial-evidence-migration.mjs';
import {
  baselineCatalog,
  dataEvidence,
  digest,
  migrationEvidence,
} from './baseline-reconciliation.mjs';

const prior = [
  '0001_init',
  '0002_staff_totp_secret',
  '0003_align_application_schema',
  '0004_financial_query_indexes',
  '0005_financial_contract_evidence',
  '0006_immutable_loan_amendments',
  '0007_financial_components',
];
const next = '0008_browser_grant_hardening';
const tableNames = [
  'organizations',
  'branches',
  'staff',
  'customers',
  'loan_products',
  'loans',
  'loan_schedule',
  'collections',
  'cash_deposits',
  'documents',
  'notifications',
  'audit_logs',
  'push_subscriptions',
  'approval_requests',
  'loan_amendments',
].sort();
const privileges =
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN';
let client;
let checkpoint = 'configuration';
async function exactHistory(expected) {
  const files = migrationEvidence();
  assert.deepEqual(
    files.map((row) => row.name),
    [...prior, next],
  );
  const rows = (
    await client.query(
      'SELECT * FROM public._prisma_migrations ORDER BY migration_name',
    )
  ).rows;
  assert.deepEqual(
    rows.map((row) => row.migration_name),
    expected,
  );
  for (const row of rows) {
    assert.ok(row.finished_at && !row.rolled_back_at);
    assert.equal(
      row.checksum,
      files.find((file) => file.name === row.migration_name).checksum,
    );
  }
  return rows;
}
async function evidence() {
  const archiveExists = (
    await client.query(
      "SELECT to_regclass('pigmie_migration_evidence.original_history') IS NOT NULL AS present",
    )
  ).rows[0].present;
  return {
    catalogDigest: digest(await baselineCatalog(client)),
    dataDigest: digest(await dataEvidence(client)),
    historyDigest: digest(
      (
        await client.query(
          'SELECT * FROM public._prisma_migrations ORDER BY id',
        )
      ).rows,
    ),
    archivedDigest: digest(
      archiveExists
        ? (
            await client.query(
              'SELECT * FROM pigmie_migration_evidence.original_history ORDER BY id',
            )
          ).rows
        : null,
    ),
  };
}
async function aclEvidence() {
  return digest({
    tables: (
      await client.query(
        "SELECT c.relname,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname",
      )
    ).rows,
    defaults: (await client.query('SELECT * FROM pg_default_acl ORDER BY oid'))
      .rows,
  });
}
async function providerEvidence() {
  return digest({
    defaults: (
      await client.query(
        "SELECT * FROM pg_default_acl WHERE NOT (defaclrole=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public') AND defaclobjtype='r') ORDER BY oid",
      )
    ).rows,
    roles: (
      await client.query(
        'SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles ORDER BY rolname',
      )
    ).rows,
    membership: (
      await client.query(
        'SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor',
      )
    ).rows,
  });
}
async function deniedBrowserGrants() {
  const tables = (
    await client.query(
      "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' ORDER BY c.relname",
    )
  ).rows.map((row) => row.relname);
  assert.deepEqual(tables, tableNames);
  for (const role of ['anon', 'authenticated']) {
    const permitted = (
      await client.query(
        `SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' AND has_table_privilege($1,c.oid,$2)`,
        [role, privileges],
      )
    ).rows[0].count;
    assert.equal(permitted, 0);
  }
  const defaults = (
    await client.query(
      `SELECT count(*)::int AS count FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND d.defaclobjtype='r' AND (d.defaclnamespace=0 OR d.defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) AND (a.grantee=0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))`,
    )
  ).rows[0].count;
  assert.equal(defaults, 0);
}
async function futureTableProof() {
  const name = `__pigmie_acl_probe_${randomUUID().replaceAll('-', '')}`;
  await client.query('SAVEPOINT future_table');
  try {
    await client.query(`CREATE TABLE public."${name}" (id integer)`);
    for (const role of ['anon', 'authenticated']) {
      assert.equal(
        (
          await client.query(
            'SELECT has_table_privilege($1,$2,$3) AS permitted',
            [role, `public.${name}`, privileges],
          )
        ).rows[0].permitted,
        false,
      );
    }
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT future_table');
  }
}
try {
  const args = process.argv.slice(2);
  const developmentMode = args[0] === '--development';
  const apply = args.at(-1) === '--apply';
  const baseArgs = apply ? args.slice(0, -1) : args;
  assert.ok(
    developmentMode
      ? baseArgs.length === 2
      : baseArgs.length === 1 && baseArgs[0] === '--staging',
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
  const config = developmentMode ? development : staging;
  const ref = developmentMode ? 'yvxtkzxqaqkhyntdszcu' : 'sjelnxrlkrvwjcgqbvre';
  const url = new URL(config.DIRECT_URL);
  assert.ok(
    ['postgres:', 'postgresql:'].includes(url.protocol) && url.password,
  );
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
  let expectedBackup;
  if (developmentMode) {
    assert.match(baseArgs[1], /^backup-[a-f0-9-]{36}$/);
    const root = realpathSync(
      fileURLToPath(new URL('../../.recovery/', import.meta.url)),
    );
    const backup = realpathSync(resolve(root, baseArgs[1]));
    assert.ok(backup.startsWith(root + sep));
    const proof = JSON.parse(
      readFileSync(resolve(backup, 'verification.json'), 'utf8'),
    );
    const age = Date.now() - new Date(proof.verifiedAt).getTime();
    assert.ok(
      proof.source === 'development' &&
        proof.restoreVerified === true &&
        proof.archivedHistoryRestored === true &&
        age >= 0 &&
        age < 86400000,
    );
    expectedBackup = proof.financialMigrationSourceEvidence;
    assert.ok(expectedBackup && typeof expectedBackup === 'object');
    for (const field of [
      'catalogDigest',
      'dataDigest',
      'historyDigest',
      'archivedDigest',
      'migrationDigest',
    ])
      assert.match(expectedBackup[field], /^[a-f0-9]{64}$/);
    const require = createRequire(import.meta.url);
    const {
      decryptBackup,
    } = require('../dist/common/utils/backup-format.util.js');
    const key = parse(
      readFileSync(resolve(backup, '.env.local')),
    ).BACKUP_ENCRYPTION_KEY;
    const plaintext = decryptBackup(
      readFileSync(resolve(backup, 'application.pgbk')),
      key,
    );
    try {
      assert.ok(plaintext.subarray(0, 5).equals(Buffer.from('PGDMP')));
    } finally {
      plaintext.fill(0);
    }
  }
  const makeClient = () =>
    new pg.Client({
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
  client = makeClient();
  checkpoint = 'verified TLS connection and exact seven migrations';
  await client.connect();
  assert.ok(
    Number(
      (await client.query('SHOW server_version_num')).rows[0]
        .server_version_num,
    ) >= 170000,
  );
  assert.equal(
    (await client.query("SELECT current_user='postgres' AS operator")).rows[0]
      .operator,
    true,
  );
  const originalHistory = await exactHistory(prior);
  if (developmentMode)
    assert.deepEqual(await sourceEvidence(client), expectedBackup);
  const before = await evidence();
  const beforeAcl = await aclEvidence();
  const beforeProvider = await providerEvidence();
  checkpoint = 'transactional grant rollback and future-table proof';
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query(
      readFileSync(
        new URL(`../prisma/migrations/${next}/migration.sql`, import.meta.url),
        'utf8',
      )
        .replace(/^BEGIN;\s*$/m, '')
        .replace(/^COMMIT;\s*$/m, ''),
    );
    await deniedBrowserGrants();
    await futureTableProof();
    assert.deepEqual(await evidence(), before);
    assert.equal(await providerEvidence(), beforeProvider);
  } finally {
    await client.query('ROLLBACK');
  }
  assert.deepEqual(await evidence(), before);
  assert.equal(await aclEvidence(), beforeAcl);
  if (developmentMode)
    assert.deepEqual(await sourceEvidence(client), expectedBackup);
  console.log(
    JSON.stringify({
      environment: developmentMode ? 'development' : 'staging',
      rollbackRehearsal: 'passed',
      businessRowsAndHistory: 'unchanged',
      browserAllPrivilegesDenied: true,
      futurePostgresPublicTable: 'denied',
      providerDefaultsChanged: false,
      applied: false,
    }),
  );
  if (apply) {
    checkpoint = 'guarded Prisma deployment';
    await exactHistory(prior);
    assert.deepEqual(await evidence(), before);
    assert.equal(await aclEvidence(), beforeAcl);
    assert.equal(await providerEvidence(), beforeProvider);
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
    const deployed = spawnSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: {
          ...system,
          DIRECT_URL: config.DIRECT_URL,
          DATABASE_URL: config.DATABASE_URL,
          DOTENV_CONFIG_PATH: fileURLToPath(
            new URL(
              developmentMode ? '../.env' : '../.env.staging',
              import.meta.url,
            ),
          ),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
        windowsHide: true,
      },
    );
    assert.equal(deployed.status, 0);
    client = makeClient();
    await client.connect();
    const currentHistory = await exactHistory([...prior, next]);
    assert.deepEqual(
      currentHistory.filter((row) => row.migration_name !== next),
      originalHistory,
    );
    await deniedBrowserGrants();
    await client.query('BEGIN');
    try {
      await futureTableProof();
    } finally {
      await client.query('ROLLBACK');
    }
    const after = await evidence();
    assert.equal(await providerEvidence(), beforeProvider);
    for (const field of ['dataDigest', 'catalogDigest', 'archivedDigest'])
      assert.equal(after[field], before[field]);
    console.log(
      JSON.stringify({
        environment: developmentMode ? 'development' : 'staging',
        migration: '0008 deployed by Prisma; exact checksums verified',
        businessRowsAndOriginalHistory: 'unchanged',
        browserAllPrivilegesDenied: true,
        futurePostgresPublicTable: 'denied',
        providerDefaultsChanged: false,
        applied: true,
        providerDiagnosticsSuppressed: true,
      }),
    );
  }
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    `Browser grant operation stopped at ${checkpoint}; credentials, records and provider diagnostics suppressed. Confirm migration status before retry.`,
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
