// Isolated loopback recovery only. No hosted destination or plaintext archive files.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import net from 'node:net';
import pg from 'pg';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';
import { platformSnapshotProof } from './platform-snapshot-proof.mjs';
const require = createRequire(import.meta.url);
require('ts-node/register');
const { decryptBackup } = require('../src/common/utils/backup-format.util.ts');
const {
  decodePlatformBundle,
  restorePlatformBundle,
} = require('../src/common/utils/platform-bundle.util.ts');
const workspace = realpathSync(
  fileURLToPath(new URL('../../', import.meta.url)),
);
const root = realpathSync(join(workspace, '.recovery'));
const run = join(root, `platform-restore-${randomUUID()}`);
const osEnv = Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'LANG']
    .filter((x) => process.env[x])
    .map((x) => [x, process.env[x]]),
);
const executable = (x) =>
  join(root, 'pgsql', 'bin', x + (process.platform === 'win32' ? '.exe' : ''));
let server,
  client,
  plaintext,
  created = false,
  checkpoint = 'configuration';
async function command(path, args, env = osEnv, input) {
  return new Promise((done, fail) => {
    const child = spawn(path, args, {
      env,
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error('Recovery tool timeout'));
    }, 120000);
    child.stdin.on('error', () => {});
    child.once('error', () => {
      clearTimeout(timer);
      fail(new Error('Recovery tool unavailable'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      code === 0 ? done() : fail(new Error('Recovery tool rejected input'));
    });
    child.stdin.end(input);
  });
}
try {
  const [name, ...extra] = process.argv.slice(2);
  assert.ok(!extra.length && /^platform-[a-f0-9-]{36}$/.test(name ?? ''));
  assert.ok(root.startsWith(workspace + sep));
  const artifact = realpathSync(resolve(root, name));
  assert.ok(artifact.startsWith(root + sep));
  const verification = JSON.parse(
    readFileSync(join(artifact, 'verification.json'), 'utf8'),
  );
  assert.match(
    verification.platformSnapshot?.dataDigest ?? '',
    /^[a-f0-9]{64}$/,
  );
  const key =
    process.env.BACKUP_ENCRYPTION_KEY ||
    parse(readFileSync(join(artifact, '.env.local'))).BACKUP_ENCRYPTION_KEY;
  const encrypted = readFileSync(join(artifact, 'platform.pgbk'));
  assert.equal(
    createHash('sha256').update(encrypted).digest('hex'),
    verification.encryptedSha256,
  );
  plaintext = decryptBackup(encrypted, key);
  const verified = decodePlatformBundle(plaintext);
  assert.ok(
    ['sjelnxrlkrvwjcgqbvre', 'yvxtkzxqaqkhyntdszcu'].includes(
      verified.projectRef,
    ),
  );
  mkdirSync(run, { mode: 0o700 });
  created = true;
  if (process.platform === 'win32')
    await command('icacls.exe', [
      run,
      '/inheritance:r',
      '/grant:r',
      `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`,
    ]);
  checkpoint = 'isolated initialization';
  const password = randomBytes(32).toString('hex');
  const passwordFile = join(run, '.env.local');
  writeFileSync(passwordFile, password + '\n', { flag: 'wx', mode: 0o600 });
  const data = join(run, 'data');
  await command(executable('initdb'), [
    '-D',
    data,
    '-U',
    'recovery_test',
    '--auth=scram-sha-256',
    `--pwfile=${passwordFile}`,
    '--encoding=UTF8',
    '--locale=C',
  ]);
  const port = await new Promise((done, fail) => {
    const socket = net.createServer();
    socket.once('error', fail);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => done(port));
    });
  });
  server = spawn(
    executable('postgres'),
    [
      '-D',
      data,
      '-h',
      '127.0.0.1',
      '-p',
      String(port),
      '-c',
      'logging_collector=off',
      '-c',
      'log_statement=none',
    ],
    { env: osEnv, stdio: 'ignore', windowsHide: true },
  );
  let serverError = false;
  server.on('error', () => {
    serverError = true;
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    assert.ok(!serverError && server.exitCode === null);
    const probe = new pg.Client({
      host: '127.0.0.1',
      port,
      user: 'recovery_test',
      password,
      database: 'postgres',
      ssl: false,
      connectionTimeoutMillis: 1000,
    });
    try {
      await probe.connect();
      client = probe;
      break;
    } catch {
      await probe.end().catch(() => {});
      await new Promise((done) => setTimeout(done, 250));
    }
  }
  assert.ok(client);
  await client.query("SET TIME ZONE 'UTC'");
  // Destination-only placeholders satisfy policy references; no provider passwords or privileges are copied.
  for (const role of [
    'anon',
    'authenticated',
    'service_role',
    'pigmie_app',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'dashboard_user',
    'postgres',
  ])
    await client.query(`CREATE ROLE ${role} NOLOGIN`);
  await client.query(
    'CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$',
  );
  checkpoint = 'database restore';
  const objects = new Map();
  await restorePlatformBundle(plaintext, {
    restoreDatabase: async (database) => {
      await command(
        executable('pg_restore'),
        [
          '--no-password',
          '--no-owner',
          '--no-privileges',
          '--clean',
          '--if-exists',
          '--exit-on-error',
          '--single-transaction',
          '--dbname=postgres',
        ],
        {
          ...osEnv,
          PGHOST: '127.0.0.1',
          PGPORT: String(port),
          PGUSER: 'recovery_test',
          PGPASSWORD: password,
          PGSSLMODE: 'disable',
          PGPASSFILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
        },
        database,
      );
    },
    restoreObject: async (object) => {
      objects.set(
        JSON.stringify([object.bucket, object.name]),
        Buffer.from(object.bytes),
      );
    },
  });
  checkpoint = 'snapshot comparison';
  const restored = await platformSnapshotProof(client);
  assert.deepEqual(restored, verification.platformSnapshot);
  const bucketRows = (
    await client.query(
      'SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id',
    )
  ).rows;
  assert.deepEqual(
    bucketRows.map((x) => ({
      id: x.id,
      public: x.public,
      fileSizeLimit:
        x.file_size_limit === null ? null : Number(x.file_size_limit),
      allowedMimeTypes: x.allowed_mime_types,
    })),
    verified.bucketSettings,
  );
  const restoredObjectRows = (
    await client.query(
      'SELECT bucket_id,name FROM storage.objects ORDER BY bucket_id,name',
    )
  ).rows;
  assert.equal(restoredObjectRows.length, objects.size);
  let total = 0;
  for (const row of restoredObjectRows) {
    const bytes = objects.get(JSON.stringify([row.bucket_id, row.name]));
    assert.ok(bytes);
    const expected = verified.objects.find(
      (x) => x.bucket === row.bucket_id && x.name === row.name,
    );
    assert.ok(expected);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      createHash('sha256').update(expected.bytes).digest('hex'),
    );
    total += bytes.length;
    bytes.fill(0);
  }
  const result = {
    databaseRestoreVerified: true,
    restoredTableCount: restored.tableCount,
    allSnapshotRowsMatched: true,
    snapshotCatalogMatched: true,
    objectDestination: 'isolated-memory-adapter',
    objectCount: objects.size,
    objectBytes: total,
    allRestoredBlobBytesMatched: true,
    bucketSettingsMatched: true,
    hostedAclRestoreVerified: false,
    providerRuntimeRestoreVerified: false,
    independentEscrowVerified: false,
  };
  writeFileSync(
    join(artifact, 'restore-verification.json'),
    JSON.stringify(result),
    { mode: 0o600, flag: 'wx' },
  );
  console.log(JSON.stringify(result));
} catch {
  console.error(
    `Platform isolated restore failed at ${checkpoint}; credentials, rows and provider diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  plaintext?.fill(0);
  await client?.end().catch(() => {});
  if (server && server.exitCode === null) {
    await command(executable('pg_ctl'), [
      '-D',
      join(run, 'data'),
      '-m',
      'immediate',
      '-w',
      'stop',
    ]).catch(() => server.kill());
    await new Promise((done) => {
      if (server.exitCode !== null) done();
      else {
        server.once('close', done);
        setTimeout(done, 5000);
      }
    });
  }
  if (created) {
    const checked = realpathSync(run);
    assert.ok(checked.startsWith(root + sep) && checked === run);
    rmSync(checked, { recursive: true, force: true });
  }
}
