import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

// Compare metadata only. Do not persist credentials, definitions or business rows.
let developmentPool;
let stagingPool;
try {
  const development = parse(readFileSync(new URL('../.env', import.meta.url)));
  const staging = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(staging, development);
  const ref = 'yvxtkzxqaqkhyntdszcu';
  assert.equal(development.SUPABASE_URL, `https://${ref}.supabase.co`);
  const connection = new URL(development.DIRECT_URL);
  assert.ok(
    connection.hostname === `db.${ref}.supabase.co` ||
      (connection.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(connection.username) === `postgres.${ref}`),
  );
  function pool(value) {
    const url = new URL(value);
    for (const option of [
      'sslmode',
      'sslaccept',
      'sslcert',
      'sslrootcert',
      'sslkey',
    ])
      url.searchParams.delete(option);
    return new pg.Pool({
      connectionString: url.toString(),
      connectionTimeoutMillis: 10000,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          new URL('../prisma/supabase-ca.crt', import.meta.url),
          'utf8',
        ),
      },
    });
  }
  developmentPool = pool(development.DIRECT_URL);
  stagingPool = pool(staging.DIRECT_URL);
  async function metadata(pool) {
    const client = await pool.connect();
    try {
      await client.query(
        'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      const columns =
        await client.query(`SELECT table_name, column_name, udt_name, is_nullable,
        character_maximum_length, numeric_precision, numeric_scale, datetime_precision, column_default
        FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name,ordinal_position`);
      const constraints =
        await client.query(`SELECT c.relname AS table_name, p.conname AS name, p.contype AS type,
        p.confupdtype AS update_action, p.confdeltype AS delete_action,
        pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,p.conname`);
      const indexes = await client.query(
        "SELECT tablename AS table_name,indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename,indexname",
      );
      const triggers =
        await client.query(`SELECT c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled FROM pg_trigger t
        JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`);
      const history = await client.query(
        'SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY migration_name',
      );
      return {
        columns: columns.rows,
        constraints: constraints.rows,
        indexes: indexes.rows,
        triggers: triggers.rows,
        history: history.rows,
      };
    } finally {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  }
  const [actual, expected] = await Promise.all([
    metadata(developmentPool),
    metadata(stagingPool),
  ]);
  const key = (row) => `${row.table_name}.${row.column_name}`;
  const actualColumns = new Map(actual.columns.map((row) => [key(row), row]));
  const columnDifferences = expected.columns.flatMap((row) => {
    const previous = actualColumns.get(key(row));
    const fields = Object.keys(row).filter(
      (field) => previous?.[field] !== row[field],
    );
    return fields.length ? [{ column: key(row), differingFields: fields }] : [];
  });
  const extraColumns = actual.columns
    .filter((row) => !expected.columns.some((other) => key(other) === key(row)))
    .map(key);
  function differences(kind, normalize) {
    return expected[kind]
      .filter(
        (row) =>
          !actual[kind].some(
            (other) =>
              other.table_name === row.table_name &&
              normalize(other) === normalize(row),
          ),
      )
      .map((row) => ({
        table: row.table_name,
        name: row.name,
        type: row.type,
      }));
  }
  const migrations = new Map(
    readdirSync(new URL('../prisma/migrations/', import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => [
        entry.name,
        createHash('sha256')
          .update(
            readFileSync(
              new URL(
                `../prisma/migrations/${entry.name}/migration.sql`,
                import.meta.url,
              ),
            ),
          )
          .digest('hex'),
      ]),
  );
  const initialInGit = execFileSync(
    'git',
    ['show', 'HEAD:pigmie-api/prisma/migrations/0001_init/migration.sql'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const initialGitChecksum = createHash('sha256')
    .update(initialInGit)
    .digest('hex');
  console.log(
    JSON.stringify({
      scope: 'read-only development vs staging metadata',
      columnDifferences,
      extraColumns,
      constraintDifferences: differences(
        'constraints',
        (row) => `${row.type}:${row.definition}`,
      ),
      foreignKeyActionDifferences: expected.constraints
        .filter((row) => row.type === 'f')
        .flatMap((row) => {
          const old = actual.constraints.find(
            (candidate) =>
              candidate.table_name === row.table_name &&
              candidate.name === row.name,
          );
          return old &&
            (old.update_action !== row.update_action ||
              old.delete_action !== row.delete_action)
            ? [
                {
                  table: row.table_name,
                  name: row.name,
                  developmentUpdate: old.update_action,
                  stagingUpdate: row.update_action,
                  developmentDelete: old.delete_action,
                  stagingDelete: row.delete_action,
                },
              ]
            : [];
        }),
      indexDefinitionDifferences: differences('indexes', (row) =>
        row.definition.replace(
          /^CREATE (UNIQUE )?INDEX \S+ ON /,
          'CREATE $1INDEX ON ',
        ),
      ),
      indexNameDifferences: differences(
        'indexes',
        (row) => `${row.name}:${row.definition}`,
      ),
      developmentTriggers: actual.triggers,
      stagingTriggers: expected.triggers,
      developmentHistory: actual.history.map((row) => ({
        name: row.migration_name,
        checksumMatches: migrations.get(row.migration_name) === row.checksum,
        gitBlobChecksumMatches:
          row.migration_name === '0001_init'
            ? initialGitChecksum === row.checksum
            : undefined,
        finished: row.finished,
        rolledBack: row.rolled_back,
      })),
      unrecordedMigrations: [...migrations.keys()].filter(
        (name) =>
          !actual.history.some(
            (row) =>
              row.migration_name === name && row.finished && !row.rolled_back,
          ),
      ),
      limit:
        'No DDL, migration-history writes, data backup or rehearsal performed.',
    }),
  );
} catch {
  console.error(
    'Metadata comparison failed; credentials and database diagnostics suppressed.',
  );
  process.exitCode = 1;
} finally {
  await Promise.all([developmentPool?.end(), stagingPool?.end()]);
}
