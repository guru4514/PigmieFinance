import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

let client;
let checkpoint = 'configuration';
const argument = process.argv[2];
const apply = ['--apply-staging', '--apply-development'].includes(argument);
const developmentMode = ['--development', '--apply-development'].includes(
  argument,
);
const policy = 'pigmie_private_evidence_api_only';
try {
  assert.ok(
    process.argv.length <= 3 &&
      (!argument ||
        ['--apply-staging', '--development', '--apply-development'].includes(
          argument,
        )),
  );
  const development = parse(readFileSync(new URL('../.env', import.meta.url)));
  const staging = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(staging, development);
  assert.equal(staging.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
  const config = developmentMode ? development : staging;
  if (developmentMode) {
    assert.equal(
      config.SUPABASE_URL,
      'https://yvxtkzxqaqkhyntdszcu.supabase.co',
    );
    const connection = new URL(config.DIRECT_URL);
    assert.ok(
      connection.hostname === 'db.yvxtkzxqaqkhyntdszcu.supabase.co' ||
        (connection.hostname.endsWith('.pooler.supabase.com') &&
          decodeURIComponent(connection.username) ===
            'postgres.yvxtkzxqaqkhyntdszcu' &&
          connection.port === '5432'),
    );
  }
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
    statement_timeout: 10000,
  });
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s'");
  checkpoint = 'storage table protection';
  const rls = (
    await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass",
    )
  ).rows[0];
  assert.equal(rls.relrowsecurity, true);
  const existing = (
    await client.query(
      "SELECT permissive,roles,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=$1",
      [policy],
    )
  ).rows;
  if (existing.length === 0)
    await client.query(
      `CREATE POLICY ${policy} ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated USING (bucket_id NOT IN ('collection-photos','kyc-documents')) WITH CHECK (bucket_id NOT IN ('collection-photos','kyc-documents'))`,
    );
  else {
    assert.equal(existing[0].permissive, 'RESTRICTIVE');
    assert.deepEqual([...existing[0].roles].sort(), ['anon', 'authenticated']);
    assert.ok(
      existing[0].qual.includes('collection-photos') &&
        existing[0].qual.includes('kyc-documents'),
    );
    assert.equal(existing[0].qual, existing[0].with_check);
  }
  checkpoint = 'direct browser roles';
  const sub = randomUUID();
  for (const role of ['anon', 'authenticated']) {
    await client.query('SAVEPOINT browser_check');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub, role, aal: 'aal2' }),
    ]);
    const rows = await client.query(
      "SELECT count(*)::int AS count FROM storage.objects WHERE bucket_id IN ('collection-photos','kyc-documents')",
    );
    assert.equal(rows.rows[0].count, 0);
    let denied = false;
    try {
      await client.query(
        "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('collection-photos',$1,$2)",
        [`synthetic-policy-${randomUUID()}`, sub],
      );
    } catch (error) {
      assert.equal(error.code, '42501');
      denied = true;
    }
    assert.equal(denied, true);
    await client.query('ROLLBACK TO SAVEPOINT browser_check');
  }
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(
    JSON.stringify({
      storageRls: true,
      browserReadsDenied: true,
      browserInsertDenied: true,
      mode: apply
        ? `applied only to ${developmentMode ? 'development' : 'staging'}`
        : 'dry-run rolled back',
      policy,
      buckets: ['collection-photos', 'kyc-documents'],
      limit:
        'Role-level direct access tested; signed grants and real browser/device recovery need separate verification.',
    }),
  );
} catch {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(
    `Staging storage policy verification failed at ${checkpoint}; credentials and SQL diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
