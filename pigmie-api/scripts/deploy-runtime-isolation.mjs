import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
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

export const migration = '0009_runtime_access_isolation';
export function configuration(mode) {
  assert.ok(['--staging', '--development'].includes(mode));
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
  return {
    config: mode === '--development' ? development : staging,
    ref:
      mode === '--development'
        ? 'yvxtkzxqaqkhyntdszcu'
        : 'sjelnxrlkrvwjcgqbvre',
    path: fileURLToPath(
      new URL(
        mode === '--development' ? '../.env' : '../.env.staging',
        import.meta.url,
      ),
    ),
  };
}
export function connection(value, ref, runtime = false) {
  const url = new URL(value);
  assert.ok(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.password &&
      url.pathname === '/postgres',
  );
  const name = runtime ? 'pigmie_runtime' : 'postgres';
  assert.ok(
    (url.hostname === `db.${ref}.supabase.co` &&
      decodeURIComponent(url.username) === name) ||
      (url.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(url.username) === `${name}.${ref}` &&
        (runtime ? ['5432', '6543'].includes(url.port) : url.port === '5432')),
  );
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
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL('../prisma/supabase-ca.crt', import.meta.url),
        'utf8',
      ),
    },
  });
}
export async function exactHistory(client, applied) {
  const files = migrationEvidence();
  assert.equal(files.length, 9);
  assert.equal(files.at(-1).name, migration);
  const history = (
    await client.query(
      'SELECT * FROM public._prisma_migrations ORDER BY migration_name',
    )
  ).rows;
  assert.equal(history.length, applied ? 9 : 8);
  for (const [i, row] of history.entries()) {
    assert.equal(row.migration_name, files[i].name);
    assert.equal(row.checksum, files[i].checksum);
    assert.ok(row.finished_at && !row.rolled_back_at);
  }
  return history;
}
async function evidence(client) {
  return digest({
    catalog: await baselineCatalog(client),
    data: await dataEvidence(client),
    history: (
      await client.query('SELECT * FROM public._prisma_migrations ORDER BY id')
    ).rows,
    roles: (
      await client.query(
        'SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles ORDER BY rolname',
      )
    ).rows,
    grants: (
      await client.query(
        "SELECT n.nspname,c.relname,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname",
      )
    ).rows,
    defaults: (await client.query('SELECT * FROM pg_default_acl ORDER BY oid'))
      .rows,
    schemaAcl: (
      await client.query(
        "SELECT nspname,nspacl FROM pg_namespace WHERE nspname='public'",
      )
    ).rows,
    functionAcl: (
      await client.query(
        "SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.proacl,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,args",
      )
    ).rows,
    memberships: (
      await client.query(
        'SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor',
      )
    ).rows,
    archived: (
      await client.query(
        "SELECT to_regclass('pigmie_migration_evidence.original_history') IS NOT NULL AS present",
      )
    ).rows[0].present
      ? (
          await client.query(
            'SELECT * FROM pigmie_migration_evidence.original_history ORDER BY id',
          )
        ).rows
      : null,
  });
}
export async function verifyRole(client, login = false) {
  const row = (
    await client.query(
      "SELECT rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='pigmie_runtime'",
    )
  ).rows[0];
  assert.deepEqual(row, {
    rolcanlogin: login,
    rolsuper: false,
    rolinherit: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolbypassrls: false,
  });
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='pigmie_runtime')",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname='pigmie_runtime')",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname IN ('auth','storage','pigmie_migration_evidence') AND has_table_privilege('pigmie_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE')",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await client.query(
        "SELECT has_schema_privilege('pigmie_runtime','public','CREATE') AS allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await client.query(
        "SELECT has_table_privilege('pigmie_runtime','public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE') AS allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))",
      )
    ).rows[0].n,
    0,
  );
}
async function run() {
  let client,
    checkpoint = 'configuration';
  try {
    const args = process.argv.slice(2),
      apply = args.at(-1) === '--apply';
    const base = apply ? args.slice(0, -1) : args;
    assert.equal(base.length, base[0] === '--development' ? 2 : 1);
    const { config, ref, path } = configuration(base[0]);
    let expected;
    if (base[0] === '--development') {
      assert.match(base[1], /^backup-[a-f0-9-]{36}$/);
      const root = realpathSync(
          fileURLToPath(new URL('../../.recovery/', import.meta.url)),
        ),
        folder = realpathSync(resolve(root, base[1]));
      assert.ok(folder.startsWith(root + sep));
      const proof = JSON.parse(
          readFileSync(resolve(folder, 'verification.json'), 'utf8'),
        ),
        age = Date.now() - Date.parse(proof.verifiedAt);
      assert.ok(
        proof.source === 'development' &&
          proof.restoreVerified === true &&
          proof.archivedHistoryRestored === true &&
          age >= 0 &&
          age < 86400000,
      );
      expected = proof.financialMigrationSourceEvidence;
      assert.ok(expected);
      const { decryptBackup } = createRequire(import.meta.url)(
        '../dist/common/utils/backup-format.util.js',
      );
      const plaintext = decryptBackup(
        readFileSync(resolve(folder, 'application.pgbk')),
        parse(readFileSync(resolve(folder, '.env.local')))
          .BACKUP_ENCRYPTION_KEY,
      );
      try {
        assert.ok(plaintext.subarray(0, 5).equals(Buffer.from('PGDMP')));
      } finally {
        plaintext.fill(0);
      }
    }
    client = connection(config.DIRECT_URL, ref);
    await client.connect();
    assert.equal(
      (await client.query("SELECT current_user='postgres' AS operator")).rows[0]
        .operator,
      true,
    );
    checkpoint = 'prior checksums and inactive legacy login';
    const original = await exactHistory(client, false);
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='pigmie_app'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM pg_policies WHERE schemaname<>'public' AND (coalesce(qual,'')||coalesce(with_check,'')) ~ '(current_staff_org_id|request_organization_id)'",
        )
      ).rows[0].n,
      0,
    );
    if (expected) assert.deepEqual(await sourceEvidence(client), expected);
    const before = await evidence(client),
      beforeData = await dataEvidence(client);
    checkpoint = 'RLS rollback rehearsal';
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout='5s'");
      checkpoint = 'transactional runtime SQL';
      await client.query(
        readFileSync(
          new URL(
            `../prisma/migrations/${migration}/migration.sql`,
            import.meta.url,
          ),
          'utf8',
        )
          .replace(/^BEGIN;\s*$/m, '')
          .replace(/^COMMIT;\s*$/m, ''),
      );
      checkpoint = 'transactional restricted role attributes and grants';
      await verifyRole(client, false);
      checkpoint = 'transactional unscoped RLS reads';
      // Supabase's managed postgres is not a superuser. A temporary membership
      // lets this rollback-only rehearsal exercise RLS; it is never deployed.
      await client.query('GRANT pigmie_runtime TO postgres');
      await client.query('SET LOCAL ROLE pigmie_runtime');
      for (const table of [
        'organizations',
        'staff',
        'customers',
        'loans',
        'loan_schedule',
        'collections',
        'audit_logs',
        'loan_amendments',
      ]) {
        checkpoint = `transactional unscoped ${table} RLS read`;
        assert.equal(
          (await client.query(`SELECT count(*)::int AS n FROM public.${table}`))
            .rows[0].n,
          0,
        );
      }
      await client.query('RESET ROLE');
    } finally {
      await client.query('ROLLBACK');
    }
    checkpoint = 'post-rollback preservation';
    assert.equal(await evidence(client), before);
    if (expected) assert.deepEqual(await sourceEvidence(client), expected);
    console.log(
      JSON.stringify({
        environment: base[0].slice(2),
        rollbackVerified: true,
        rowsHistoryGrantsPreserved: true,
        applied: false,
      }),
    );
    if (apply) {
      checkpoint = 'normal Prisma deployment';
      await exactHistory(client, false);
      assert.equal(await evidence(client), before);
      await client.end();
      client = undefined;
      const system = Object.fromEntries(
        Object.entries(process.env).filter(([k]) =>
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
          ].includes(k.toUpperCase()),
        ),
      );
      const result = spawnSync(
        process.execPath,
        ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
        {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: {
            ...system,
            DIRECT_URL: config.DIRECT_URL,
            DATABASE_URL: config.DATABASE_URL,
            DOTENV_CONFIG_PATH: path,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120000,
          windowsHide: true,
        },
      );
      assert.equal(result.status, 0);
      client = connection(config.DIRECT_URL, ref);
      await client.connect();
      const after = await exactHistory(client, true);
      assert.deepEqual(after.slice(0, 8), original);
      await verifyRole(client, false);
      assert.deepEqual(await dataEvidence(client), beforeData);
      if (expected)
        assert.equal(
          (await sourceEvidence(client)).archivedDigest,
          expected.archivedDigest,
        );
      console.log(
        JSON.stringify({
          environment: base[0].slice(2),
          migration,
          applied: true,
          checksumsVerified: true,
          businessRowsPreserved: true,
          runtimeLogin: false,
        }),
      );
    }
  } catch {
    await client?.query('ROLLBACK').catch(() => {});
    console.error(
      `Runtime migration stopped at ${checkpoint}; secrets and provider diagnostics suppressed.`,
    );
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await run();
