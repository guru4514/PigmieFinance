import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import pg from 'pg';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';
import { validateStaging } from './staging.mjs';
import { platformSnapshotProof } from './platform-snapshot-proof.mjs';
import {
  baselineCatalog,
  dataEvidence,
  digest,
  migrationEvidence,
} from './baseline-reconciliation.mjs';

const require = createRequire(import.meta.url);
require('ts-node/register');
const {
  encodePlatformBundle,
  decodePlatformBundle,
  MAX_PLATFORM_BUNDLE_BYTES,
  MAX_PLATFORM_OBJECT_BYTES,
} = require('../src/common/utils/platform-bundle.util.ts');
const {
  encryptedBackupStream,
  decryptBackup,
} = require('../src/common/utils/backup-format.util.ts');
const {
  backupProcessEnvironment,
} = require('../src/common/utils/backup-process.util.ts');
const workspace = realpathSync(
  fileURLToPath(new URL('../../', import.meta.url)),
);
const recovery = join(workspace, '.recovery');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const osEnv = Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'LANG']
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]),
);
let checkpoint = 'configuration';
let source,
  output,
  success = false;
async function command(path, args, environment = osEnv) {
  return new Promise((done, fail) => {
    const child = spawn(path, args, {
      env: environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error('Recovery command timed out'));
    }, 120000);
    child.stdout.on('data', (bytes) => {
      size += bytes.length;
      if (size > MAX_PLATFORM_BUNDLE_BYTES) {
        child.kill();
        fail(new Error('Recovery archive too large'));
      } else chunks.push(bytes);
    });
    child.stderr.resume();
    child.once('error', () => {
      clearTimeout(timer);
      fail(new Error('Recovery command unavailable'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      code === 0
        ? done(Buffer.concat(chunks))
        : fail(new Error('Recovery command failed'));
    });
  });
}
const identityRows = async (client) =>
  (
    await client.query(
      'SELECT bucket_id,name,version,updated_at,metadata FROM storage.objects ORDER BY bucket_id,name',
    )
  ).rows;
const bucketRows = async (client) =>
  (
    await client.query(
      'SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id',
    )
  ).rows;
async function download(config, object) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30000);
  let reader;
  try {
    const path = object.name.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(
      `${config.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(object.bucket_id)}/${path}`,
      {
        headers: {
          apikey: config.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        signal: abort.signal,
      },
    );
    if (!response.ok || !response.body)
      throw new Error('Storage object unavailable');
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_PLATFORM_OBJECT_BYTES)
      throw new Error('Storage object too large');
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PLATFORM_OBJECT_BYTES)
        throw new Error('Storage object too large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    abort.abort();
    await reader?.cancel().catch(() => undefined);
  }
}
try {
  const options = process.argv.slice(2);
  assert.ok(options.every((option) => option === '--development'));
  const development = parse(readFileSync(new URL('../.env', import.meta.url)));
  const staging = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(staging, development);
  assert.equal(staging.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
  const config = options.includes('--development') ? development : staging;
  const ref = options.includes('--development')
    ? 'yvxtkzxqaqkhyntdszcu'
    : 'sjelnxrlkrvwjcgqbvre';
  assert.equal(config.SUPABASE_URL, `https://${ref}.supabase.co`);
  assert.match(config.PII_ENCRYPTION_KEY ?? '', /^[a-f0-9]{64}$/i);
  const connection = new URL(config.DIRECT_URL);
  assert.ok(
    connection.hostname === `db.${ref}.supabase.co` ||
      (connection.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(connection.username) === `postgres.${ref}` &&
        connection.port === '5432'),
  );
  assert.equal(connection.pathname, '/postgres');
  assert.ok(connection.password);
  for (const name of [
    'sslmode',
    'sslaccept',
    'sslrootcert',
    'sslcert',
    'sslkey',
  ])
    connection.searchParams.delete(name);
  const connect = () =>
    new pg.Client({
      connectionString: connection.toString(),
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
  source = connect();
  checkpoint = 'database snapshot';
  await source.connect();
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const capturedAt = new Date().toISOString();
  const snapshot = (await source.query('SELECT pg_export_snapshot() AS value'))
    .rows[0].value;
  assert.match(snapshot, /^[a-fA-F0-9-]+$/);
  const identities = await identityRows(source);
  const missingReferences = (
    await source.query(
      "SELECT count(*)::int AS value FROM public.documents d LEFT JOIN storage.objects o ON o.bucket_id=CASE WHEN d.related_entity_type::text='customer' THEN 'kyc-documents' ELSE 'collection-photos' END AND o.name=d.file_path WHERE o.id IS NULL",
    )
  ).rows[0].value;
  assert.equal(
    missingReferences,
    0,
    'Source contains missing document objects',
  );
  assert.ok(identities.length <= 10000);
  const buckets = await bucketRows(source);
  const extensions = (
    await source.query(
      'SELECT extname AS name,extversion AS version FROM pg_extension ORDER BY extname',
    )
  ).rows;
  const history = (
    await source.query(
      "SELECT to_regclass('pigmie_migration_evidence.original_history') IS NOT NULL AS present",
    )
  ).rows[0].present;
  const sourceProof = {
    platformSnapshot: await platformSnapshotProof(source),
    sourceCatalogDigest: digest(await baselineCatalog(source)),
    sourceDataDigest: digest(await dataEvidence(source)),
    sourceHistoryDigest: digest(
      (
        await source.query(
          'SELECT * FROM public._prisma_migrations ORDER BY migration_name,id',
        )
      ).rows,
    ),
    archivedHistoryDigest: history
      ? digest(
          (
            await source.query(
              'SELECT * FROM pigmie_migration_evidence.original_history ORDER BY migration_name,id',
            )
          ).rows,
        )
      : null,
    migrationDigest: digest(migrationEvidence()),
    databaseRestoreVerified: false,
  };
  const executable =
    process.env.PG_DUMP_PATH ||
    join(
      recovery,
      'pgsql',
      'bin',
      process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump',
    );
  const database = await command(
    executable,
    [
      '--no-password',
      '--format=custom',
      '--schema=public',
      '--schema=auth',
      '--schema=storage',
      ...(history ? ['--schema=pigmie_migration_evidence'] : []),
      `--snapshot=${snapshot}`,
    ],
    backupProcessEnvironment(
      config.DIRECT_URL,
      fileURLToPath(new URL('../prisma/supabase-ca.crt', import.meta.url)),
    ),
  );
  await source.query('COMMIT');
  await source.end();
  source = undefined;
  // Never hold a database transaction during Storage network downloads.
  const objects = [];
  checkpoint = 'Storage content reads';
  let total = database.length;
  for (const identity of identities) {
    const bytes = await download(config, identity);
    total += bytes.length;
    assert.ok(total <= MAX_PLATFORM_BUNDLE_BYTES - 1024 * 1024);
    objects.push({ bucket: identity.bucket_id, name: identity.name, bytes });
  }
  // Independently re-read bytes and object metadata; fail on any observed cross-service change.
  for (let index = 0; index < identities.length; index++)
    assert.equal(
      hash(await download(config, identities[index])),
      hash(objects[index].bytes),
    );
  source = connect();
  checkpoint = 'source consistency recheck';
  await source.connect();
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(
    JSON.stringify(await identityRows(source)),
    JSON.stringify(identities),
  );
  assert.equal(
    JSON.stringify(await bucketRows(source)),
    JSON.stringify(buckets),
  );
  await source.query('COMMIT');
  await source.end();
  source = undefined;
  const bundle = encodePlatformBundle({
    projectRef: ref,
    capturedAt,
    database,
    objects,
    bucketSettings: buckets.map((bucket) => ({
      id: bucket.id,
      public: bucket.public,
      fileSizeLimit:
        bucket.file_size_limit === null ? null : Number(bucket.file_size_limit),
      allowedMimeTypes: bucket.allowed_mime_types,
    })),
    extensions,
  });
  checkpoint = 'bundle authentication';
  const key =
    process.env.BACKUP_ENCRYPTION_KEY || randomBytes(32).toString('hex');
  const chunks = [];
  for await (const bytes of Readable.from([bundle]).pipe(
    encryptedBackupStream(key),
  ))
    chunks.push(bytes);
  const encrypted = Buffer.concat(chunks);
  assert.deepEqual(
    decodePlatformBundle(decryptBackup(encrypted, key)),
    decodePlatformBundle(bundle),
  );
  mkdirSync(recovery, { recursive: true });
  checkpoint = 'restricted encrypted retention';
  assert.ok(realpathSync(recovery).startsWith(workspace + sep));
  output = join(realpathSync(recovery), `platform-${randomUUID()}`);
  mkdirSync(output, { mode: 0o700 });
  if (process.platform === 'win32')
    await command('icacls.exe', [
      output,
      '/inheritance:r',
      '/grant:r',
      `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`,
    ]);
  // Keys exist only in the restricted ignored environment file, never in the manifest.
  writeFileSync(
    join(output, '.env.local'),
    `BACKUP_ENCRYPTION_KEY=${key}\nPII_ENCRYPTION_KEY=${config.PII_ENCRYPTION_KEY}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  writeFileSync(join(output, 'platform.pgbk'), encrypted, {
    flag: 'wx',
    mode: 0o600,
  });
  const persisted = decodePlatformBundle(
    decryptBackup(readFileSync(join(output, 'platform.pgbk')), key),
  );
  assert.equal(persisted.objects.length, identities.length);
  const verification = {
    version: 1,
    capturedAt,
    bundleAuthenticated: true,
    databaseArchiveIncluded: true,
    storageObjectCount: identities.length,
    bucketCount: buckets.length,
    encryptedSha256: hash(encrypted),
    objectBytesDoubleReadVerified: true,
    sourceMetadataUnchanged: true,
    atomicCrossServiceSnapshot: false,
    independentEscrowVerified: false,
    providerRuntimeRestoreVerified: false,
    ...sourceProof,
  };
  writeFileSync(
    join(output, 'verification.json'),
    JSON.stringify(verification),
    { flag: 'wx', mode: 0o600 },
  );
  bundle.fill(0);
  database.fill(0);
  for (const object of objects) object.bytes.fill(0);
  success = true;
  console.log(
    JSON.stringify({
      ...verification,
      artifact: output.slice(workspace.length + 1),
    }),
  );
} catch {
  console.error(
    `Platform export failed at ${checkpoint}; rows, object paths, credentials and provider diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await source?.end().catch(() => undefined);
  if (output && !success) rmSync(output, { recursive: true, force: true });
}
