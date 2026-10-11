import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import { validateStaging } from './staging.mjs';

// Inventory only: do not fetch URLs, mutate buckets, clear references or delete objects.
const pools = [];
try {
  const development = parse(readFileSync(new URL('../.env', import.meta.url)));
  const staging = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(staging, development);
  assert.equal(staging.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
  assert.equal(
    development.SUPABASE_URL,
    'https://yvxtkzxqaqkhyntdszcu.supabase.co',
  );
  for (const [environment, config] of [
    ['development', development],
    ['staging', staging],
  ]) {
    const url = new URL(config.DIRECT_URL);
    if (environment === 'development')
      assert.ok(
        url.hostname === 'db.yvxtkzxqaqkhyntdszcu.supabase.co' ||
          (url.hostname.endsWith('.pooler.supabase.com') &&
            decodeURIComponent(url.username) ===
              'postgres.yvxtkzxqaqkhyntdszcu' &&
            url.port === '5432'),
      );
    for (const key of [
      'sslmode',
      'sslaccept',
      'sslcert',
      'sslrootcert',
      'sslkey',
    ])
      url.searchParams.delete(key);
    const pool = new pg.Pool({
      connectionString: url.toString(),
      max: 1,
      connectionTimeoutMillis: 10000,
      statement_timeout: 10000,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          new URL('../prisma/supabase-ca.crt', import.meta.url),
          'utf8',
        ),
      },
    });
    pools.push(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const legacy = (
        await client.query(
          "SELECT count(*)::int AS references FROM public.collections WHERE photo_url IS NOT NULL AND photo_url <> ''",
        )
      ).rows[0];
      const buckets = (
        await client.query(
          "SELECT b.id,b.public,count(o.id)::int AS objects FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id=b.id WHERE b.id IN ('collection-photos','kyc-documents') GROUP BY b.id,b.public ORDER BY b.id",
        )
      ).rows;
      const documents = (
        await client.query(
          "SELECT count(*)::int AS registered,count(*) FILTER (WHERE o.id IS NULL)::int AS missing_objects FROM public.documents d LEFT JOIN storage.objects o ON o.name=d.file_path AND o.bucket_id=CASE WHEN d.related_entity_type='customer' THEN 'kyc-documents' ELSE 'collection-photos' END",
        )
      ).rows[0];
      console.log(
        JSON.stringify({
          environment,
          legacyPhotoReferences: legacy.references,
          knownBuckets: buckets,
          registeredDocuments: documents.registered,
          missingRegisteredObjects: documents.missing_objects,
          limit:
            'No blob download/content review, legacy client IndexedDB access, object deletion or bucket mutation performed',
        }),
      );
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  }
} catch {
  console.error(
    'Evidence inventory failed; credentials, paths and provider diagnostics suppressed.',
  );
  process.exitCode = 1;
} finally {
  await Promise.all(pools.map((pool) => pool.end()));
}
