import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

// Metadata only. Do not run schema deployment or seed records from this check.
let client;
try {
  const config = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  let runtime = {};
  try {
    runtime = parse(readFileSync(new URL('../.env', import.meta.url)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  validateStaging(config, runtime);
  const direct = new URL(config.DIRECT_URL);
  for (const parameter of [
    'sslmode',
    'sslaccept',
    'sslcert',
    'sslrootcert',
    'sslkey',
  ])
    direct.searchParams.delete(parameter);
  client = new pg.Client({
    connectionString: direct.toString(),
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL('../prisma/supabase-ca.crt', import.meta.url),
        'utf8',
      ),
    },
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public' ORDER BY tablename
  `);
  const roles = await client.query(`
    SELECT rolname, rolbypassrls FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname
  `);
  await client.query('ROLLBACK');
  console.log(
    JSON.stringify(
      {
        project: config.STAGING_PROJECT_REF,
        publicTables: result.rows,
        providerRoles: roles.rows,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : 'UNCLASSIFIED';
  console.error(
    `Staging inspection failed (${code}). Check the isolated configuration, password, network and trusted TLS certificate; no credentials have been printed.`,
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
