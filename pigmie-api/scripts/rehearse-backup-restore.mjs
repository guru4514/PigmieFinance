import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import net from 'node:net';
import pg from 'pg';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';
import { validateStaging } from './staging.mjs';

const require = createRequire(import.meta.url);
const {
  encryptedBackupStream,
  decryptBackup,
} = require('../dist/common/utils/backup-format.util.js');
const {
  backupProcessEnvironment,
} = require('../dist/common/utils/backup-process.util.js');
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const recoveryRoot = resolve(workspace, '.recovery');
const runRoot = join(recoveryRoot, `run-${randomUUID()}`);
const bin = process.env.RECOVERY_PG_BIN || join(recoveryRoot, 'pgsql', 'bin');
const executable = (name) =>
  join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
let source, target, server;
let checkpoint = 'configuration';
let success = false;
const osEnvironment = Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'LANG']
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]),
);
async function command(name, args, environment = osEnvironment, input) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable(name), args, {
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks = [];
    let size = 0;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Recovery tool timed out'));
    }, 120000);
    child.stdout.on('data', (bytes) => {
      size += bytes.length;
      if (size > 256 * 1024 * 1024) {
        child.kill();
        reject(new Error('Rehearsal archive too large'));
      } else chunks.push(bytes);
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('Recovery tool unavailable'));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolveCommand(Buffer.concat(chunks));
      else reject(new Error('Recovery tool failed'));
    });
    child.stdin.end(input);
  });
}
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
try {
  assert.equal(process.argv.length, 2);
  const config = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(
    config,
    parse(readFileSync(new URL('../.env', import.meta.url))),
  );
  assert.equal(config.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
  const url = new URL(config.DIRECT_URL);
  for (const key of [
    'sslmode',
    'sslaccept',
    'sslcert',
    'sslrootcert',
    'sslkey',
  ])
    url.searchParams.delete(key);
  source = new pg.Client({
    connectionString: url.toString(),
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
  await source.connect();
  await source.query("SET TIME ZONE 'UTC'");
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (
    await source.query('SELECT pg_export_snapshot() AS snapshot')
  ).rows[0].snapshot;
  assert.match(snapshot, /^[A-Fa-f0-9-]+$/);
  checkpoint = 'encrypted staging application dump';
  const dump = await command(
    'pg_dump',
    [
      '--no-password',
      '--format=custom',
      '--schema=public',
      `--snapshot=${snapshot}`,
    ],
    backupProcessEnvironment(
      config.DIRECT_URL,
      fileURLToPath(new URL('../prisma/supabase-ca.crt', import.meta.url)),
    ),
  );
  assert.ok(dump.subarray(0, 5).equals(Buffer.from('PGDMP')));
  const key = randomBytes(32).toString('hex');
  const encryptedChunks = [];
  for await (const chunk of Readable.from([dump]).pipe(
    encryptedBackupStream(key),
  ))
    encryptedChunks.push(chunk);
  const encrypted = Buffer.concat(encryptedChunks);
  const restoredBytes = decryptBackup(encrypted, key);
  assert.ok(restoredBytes.equals(dump));
  const corrupt = Buffer.from(encrypted);
  corrupt[20] ^= 1;
  assert.throws(() => decryptBackup(corrupt, key));
  assert.throws(() =>
    decryptBackup(encrypted, randomBytes(32).toString('hex')),
  );

  checkpoint = 'isolated PostgreSQL initialization';
  mkdirSync(runRoot, { recursive: true });
  const password = randomBytes(32).toString('hex');
  // initdb expects a one-line password file. Its only persisted credential is
  // this ignored .env.local, removed with the disposable cluster after the run.
  const passwordFile = join(runRoot, '.env.local');
  writeFileSync(passwordFile, password + '\n', { mode: 0o600, flag: 'wx' });
  const data = join(runRoot, 'data');
  await command('initdb', [
    '-D',
    data,
    '-U',
    'recovery_test',
    '--auth=scram-sha-256',
    `--pwfile=${passwordFile}`,
    '--encoding=UTF8',
    '--locale=C',
  ]);
  const port = await new Promise((resolvePort, reject) => {
    const reservation = net.createServer();
    reservation.on('error', reject);
    reservation.listen(0, '127.0.0.1', () => {
      const chosen = reservation.address().port;
      reservation.close(() => resolvePort(chosen));
    });
  });
  // No service registration or shared configuration. Listen only on loopback.
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
    {
      env: osEnvironment,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    },
  );
  let serverError = false;
  server.on('error', () => {
    serverError = true;
  });
  const localOptions = {
    host: '127.0.0.1',
    port,
    user: 'recovery_test',
    password,
    database: 'postgres',
    ssl: false,
    connectionTimeoutMillis: 1000,
  };
  for (let attempt = 0; attempt < 40; attempt++) {
    if (serverError || server.exitCode !== null)
      throw new Error('Local server failed');
    const probe = new pg.Client(localOptions);
    try {
      await probe.connect();
      target = probe;
      break;
    } catch {
      await probe.end().catch(() => {});
      await new Promise((done) => setTimeout(done, 250));
    }
  }
  assert.ok(target);
  await target.query("SET TIME ZONE 'UTC'");
  await target.query(
    'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE pigmie_app; CREATE ROLE supabase_admin; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$',
  );
  checkpoint = 'authenticated archive restore';
  await command(
    'pg_restore',
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
      ...osEnvironment,
      PGHOST: '127.0.0.1',
      PGPORT: String(port),
      PGUSER: 'recovery_test',
      PGPASSWORD: password,
      PGSSLMODE: 'disable',
      PGPASSFILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
    },
    restoredBytes,
  );
  checkpoint = 'restored data and schema comparison';
  const tables = (
    await source.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  for (const { tablename } of tables) {
    checkpoint = `${tablename} restored data comparison`;
    const sql = `SELECT count(*)::text AS count, md5(COALESCE(string_agg(row_hash, '' ORDER BY row_hash), '')) AS digest FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM public.${quote(tablename)} t) rows`;
    assert.deepEqual(
      (await target.query(sql)).rows,
      (await source.query(sql)).rows,
    );
  }
  checkpoint = 'restored constraints and RLS comparison';
  const metadata = `SELECT c.relname,c.relrowsecurity,p.conname,pg_get_constraintdef(p.oid) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_constraint p ON p.conrelid=c.oid WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname,p.conname`;
  assert.deepEqual(
    (await target.query(metadata)).rows,
    (await source.query(metadata)).rows,
  );
  checkpoint = 'restored index comparison';
  const indexes =
    "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname";
  assert.deepEqual(
    (await target.query(indexes)).rows,
    (await source.query(indexes)).rows,
  );
  checkpoint = 'restored policy comparison';
  const policies =
    "SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname";
  assert.deepEqual(
    (await target.query(policies)).rows,
    (await source.query(policies)).rows,
  );
  checkpoint = 'restored functions and triggers comparison';
  const functions =
    "SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,arguments";
  assert.deepEqual(
    (await target.query(functions)).rows,
    (await source.query(functions)).rows,
  );
  const triggers =
    "SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname";
  assert.deepEqual(
    (await target.query(triggers)).rows,
    (await source.query(triggers)).rows,
  );
  await source.query('ROLLBACK');
  success = true;
  console.log(
    JSON.stringify({
      applicationRestore: 'passed',
      tablesCompared: tables.length,
      dataFingerprints: 'match',
      constraintsIndexesPolicies: 'match',
      functionsTriggers: 'match',
      archiveAuthentication: 'wrong key and tampering rejected',
      source: 'staging read-only snapshot',
      target: 'disposable loopback PostgreSQL',
      plaintextDumpWritten: false,
      externalUploadTested: false,
      limit:
        'public schema only; ACLs/ownership, Supabase Auth, Storage blobs, service configuration and full-platform recovery excluded',
    }),
  );
} catch {
  console.error(
    `Backup restore rehearsal failed at ${checkpoint}; credentials, rows and tool diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await source?.query('ROLLBACK').catch(() => {});
  await source?.end().catch(() => {});
  await target?.end().catch(() => {});
  let stopped = !server;
  if (server) {
    try {
      await command('pg_ctl', [
        '-D',
        join(runRoot, 'data'),
        'stop',
        '-m',
        'fast',
        '-w',
      ]);
      stopped = true;
    } catch {
      stopped = server.exitCode !== null;
    }
  }
  // Only this run's resolved child directory can ever be recursively removed.
  if (
    stopped &&
    runRoot.startsWith(recoveryRoot + sep) &&
    /^run-[a-f0-9-]{36}$/.test(runRoot.slice(recoveryRoot.length + 1))
  ) {
    try {
      rmSync(runRoot, { recursive: true, force: true });
      console.log('Disposable cluster and local credential file removed.');
    } catch {
      console.error('Disposable files cleanup could not be confirmed.');
      process.exitCode = 1;
    }
  } else {
    console.error(
      'Recovery cleanup could not be confirmed; isolated target requires attention.',
    );
    process.exitCode = 1;
  }
  if (!success) process.exitCode = 1;
}
