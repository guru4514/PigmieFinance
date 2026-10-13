import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
export const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function migrationEvidence() {
  return readdirSync(new URL('../prisma/migrations/', import.meta.url), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => ({
      name,
      checksum: createHash('sha256')
        .update(
          readFileSync(
            new URL(
              `../prisma/migrations/${name}/migration.sql`,
              import.meta.url,
            ),
          ),
        )
        .digest('hex'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function baselineCatalog(client) {
  const rows = async (sql) => (await client.query(sql)).rows;
  return {
    columns: await rows(
      "SELECT table_name,column_name,udt_name,is_nullable,character_maximum_length,numeric_precision,numeric_scale,datetime_precision,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name,ordinal_position",
    ),
    constraints: await rows(
      "SELECT c.relname AS table_name,p.conname AS name,p.contype AS type,pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'_prisma_migrations' ORDER BY c.relname,p.conname",
    ),
    indexes: await rows(
      "SELECT tablename AS table_name,indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename,indexname",
    ),
    policies: await rows(
      "SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname",
    ),
    rls: await rows(
      "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations' ORDER BY c.relname",
    ),
    enums: await rows(
      "SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder",
    ),
    functions: await rows(
      "SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname<>'rls_auto_enable' ORDER BY p.proname,arguments",
    ),
    triggers: await rows(
      "SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
    ),
  };
}
export async function dataEvidence(client) {
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename",
    )
  ).rows;
  const evidence = [];
  for (const { tablename } of tables) {
    const row = (
      await client.query(
        `SELECT count(*)::text AS count,md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS digest FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM public.${quote(tablename)} t) hashes`,
      )
    ).rows[0];
    evidence.push({ table: tablename, ...row });
  }
  return evidence;
}
const indexShape = (row) =>
  row.definition.replace(
    /^CREATE (UNIQUE )?INDEX \S+ ON /,
    'CREATE $1INDEX ON ',
  );

// A reviewed baseline adoption, never a claim that historical SQL was executed.
// The original records are preserved byte-for-byte in a private schema.
export async function reconcileBaseline(client, expected) {
  const before = await baselineCatalog(client);
  for (const key of [
    'columns',
    'policies',
    'rls',
    'enums',
    'functions',
    'triggers',
  ])
    assert.deepEqual(before[key], expected[key]);
  assert.equal(before.constraints.length, expected.constraints.length);
  assert.equal(before.indexes.length, expected.indexes.length);
  const businessBefore = await dataEvidence(client);
  const history = (
    await client.query('SELECT * FROM public._prisma_migrations ORDER BY id')
  ).rows;
  assert.equal(history.length, 1);
  assert.equal(history[0].migration_name, '0001_init');
  assert.ok(history[0].finished_at && !history[0].rolled_back_at);
  let correctedForeignKeys = 0,
    renamedIndexes = 0;
  for (const wanted of expected.constraints) {
    const actual = before.constraints.find(
      (row) => row.table_name === wanted.table_name && row.name === wanted.name,
    );
    assert.ok(actual);
    assert.equal(actual.type, wanted.type);
    if (actual.definition !== wanted.definition) {
      assert.equal(wanted.type, 'f');
      assert.ok(actual.definition.includes('ON UPDATE CASCADE'));
      assert.equal(
        actual.definition.replace(' ON UPDATE CASCADE', ''),
        wanted.definition,
      );
      await client.query(
        `ALTER TABLE public.${quote(wanted.table_name)} DROP CONSTRAINT ${quote(wanted.name)}, ADD CONSTRAINT ${quote(wanted.name)} ${wanted.definition}`,
      );
      correctedForeignKeys++;
    }
  }
  for (const wanted of expected.indexes) {
    const matches = before.indexes.filter(
      (row) =>
        row.table_name === wanted.table_name &&
        indexShape(row) === indexShape(wanted),
    );
    assert.equal(matches.length, 1);
    const actual = matches[0];
    if (actual.name !== wanted.name) {
      assert.ok(!before.indexes.some((row) => row.name === wanted.name));
      await client.query(
        `ALTER INDEX public.${quote(actual.name)} RENAME TO ${quote(wanted.name)}`,
      );
      renamedIndexes++;
    }
  }
  assert.deepEqual(await baselineCatalog(client), expected);
  assert.deepEqual(await dataEvidence(client), businessBefore);
  for (const role of ['anon', 'authenticated']) {
    const denied = (
      await client.query(
        "SELECT bool_or(has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE')) AS permitted FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations'",
        [role],
      )
    ).rows[0];
    assert.equal(denied.permitted, false);
  }
  await client.query('CREATE SCHEMA pigmie_migration_evidence');
  await client.query(
    'REVOKE ALL ON SCHEMA pigmie_migration_evidence FROM PUBLIC,anon,authenticated,service_role,pigmie_app',
  );
  await client.query(
    'CREATE TABLE pigmie_migration_evidence.original_history AS TABLE public._prisma_migrations',
  );
  await client.query(
    'REVOKE ALL ON TABLE pigmie_migration_evidence.original_history FROM PUBLIC,anon,authenticated,service_role,pigmie_app',
  );
  assert.deepEqual(
    (
      await client.query(
        'SELECT * FROM pigmie_migration_evidence.original_history ORDER BY id',
      )
    ).rows,
    history,
  );
  await client.query('DELETE FROM public._prisma_migrations');
  const migrations = migrationEvidence();
  assert.deepEqual(
    migrations.map((row) => row.name),
    [
      '0001_init',
      '0002_staff_totp_secret',
      '0003_align_application_schema',
      '0004_financial_query_indexes',
    ],
  );
  for (const migration of migrations)
    await client.query(
      'INSERT INTO public._prisma_migrations(id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES($1,$2,now(),$3,$4,now(),0)',
      [
        randomUUID(),
        migration.checksum,
        migration.name,
        'Verified baseline adoption; historical execution is not asserted. Original history retained in pigmie_migration_evidence.original_history.',
      ],
    );
  assert.deepEqual(await dataEvidence(client), businessBefore);
  return {
    correctedForeignKeys,
    renamedIndexes,
    historyPreserved: true,
    baselineAdopted: migrations.length,
    businessRowsUnchanged: true,
  };
}
