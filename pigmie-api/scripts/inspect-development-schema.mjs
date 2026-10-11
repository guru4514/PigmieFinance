import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ref = 'yvxtkzxqaqkhyntdszcu';
let config;
let database;
let direct;
try {
  config = parse(readFileSync(new URL('../.env', import.meta.url)));
  database = new URL(config.DATABASE_URL);
  direct = new URL(config.DIRECT_URL);
} catch {
  // URL parse failures can include the original secret-bearing input.
  console.error(
    'Development configuration is unavailable or invalid; details suppressed.',
  );
  process.exit(1);
}
if (config.SUPABASE_URL !== `https://${ref}.supabase.co`)
  throw new Error('Unexpected development project');
if (
  database.hostname !== `db.${ref}.supabase.co` &&
  !(
    database.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(database.username) === `postgres.${ref}`
  )
)
  throw new Error('Unexpected development database');
process.env.DATABASE_URL = config.DATABASE_URL;
if (
  direct.hostname !== `db.${ref}.supabase.co` &&
  !(
    direct.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(direct.username) === `postgres.${ref}`
  )
)
  throw new Error('Unexpected development migration connection');
const require = createRequire(import.meta.url);
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { Prisma } = require('@prisma/client');
const prisma = new PrismaService();
try {
  const columns =
    await prisma.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
  const actual = new Map();
  for (const column of columns) {
    if (!actual.has(column.table_name))
      actual.set(column.table_name, new Set());
    actual.get(column.table_name).add(column.column_name);
  }
  const missingTables = [];
  const missingColumns = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName || model.name;
    if (!actual.has(table)) {
      missingTables.push(table);
      continue;
    }
    for (const field of model.fields.filter((field) => field.kind !== 'object'))
      if (!actual.get(table).has(field.dbName || field.name))
        missingColumns.push({ table, column: field.dbName || field.name });
  }
  const policies =
    await prisma.$queryRaw`SELECT c.relname AS table, c.relrowsecurity AS rls, has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_access, has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations' ORDER BY c.relname`;
  const history = actual.has('_prisma_migrations')
    ? await prisma.$queryRaw`SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`
    : [];
  const comparison = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/prisma/build/index.js', import.meta.url),
      ),
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
      '--exit-code',
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, DIRECT_URL: config.DIRECT_URL },
      encoding: 'utf8',
      timeout: 60000,
    },
  );
  const status = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/prisma/build/index.js', import.meta.url),
      ),
      'migrate',
      'status',
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, DIRECT_URL: config.DIRECT_URL },
      encoding: 'utf8',
      timeout: 60000,
    },
  );
  console.log(
    JSON.stringify({
      scope: 'development metadata only; read only',
      missingTables,
      missingColumns,
      policies,
      migrationHistory: history.map((row) => row.migration_name),
      migrationStatus:
        status.status === 0
          ? 'up to date'
          : 'verification failed; diagnostics suppressed',
      schemaComparison:
        comparison.status === 0
          ? 'matches Prisma schema'
          : comparison.status === 2
            ? 'drift detected'
            : 'comparison unavailable; diagnostics suppressed',
      schemaDifferences: (comparison.stdout || '')
        .split('\n')
        .flatMap((line) => {
          const table = line.match(/^\[\*\] Changed the `([a-z_0-9]+)` table/);
          if (table) return [{ kind: 'table', name: table[1] }];
          const index = line.match(
            /^\s+\[([+-])\] (Added|Removed) index on columns \(([a-z_0-9, ]+)\)/,
          );
          if (index)
            return [
              {
                kind: 'index',
                operation: index[2],
                columns: index[3].split(',').map((column) => column.trim()),
              },
            ];
          const operation = line.match(
            /^\s+\[([+*-])\] (Added|Removed|Renamed|Altered) (foreign key|unique index|index|column)\b/,
          );
          if (operation)
            return [{ kind: operation[3], operation: operation[2] }];
          return [];
        }),
      limits:
        'Does not verify triggers, storage policies, backend least privilege or historical data correctness',
    }),
  );
} catch {
  console.error(
    'Unable to inspect development schema; no connection details or record data printed.',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
