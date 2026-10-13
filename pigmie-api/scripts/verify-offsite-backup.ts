import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { spawn } from 'node:child_process';
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import {
  assertBackupObjectKey,
  authenticateRetrievedBackup,
} from '../src/common/utils/backup-retrieval.util';
import { decodePlatformBundle } from '../src/common/utils/platform-bundle.util';

/** Read-only remote verification. Does not restore into any running database. */
async function verify() {
  if (process.argv.slice(2).some((arg) => arg !== '--retain-encrypted'))
    throw new Error('Unsupported verification option');
  const names = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'BACKUP_ENCRYPTION_KEY',
    'BACKUP_OBJECT_KEY',
  ];
  if (names.some((name) => !process.env[name]))
    throw new Error('Recovery configuration is incomplete');
  if (!/^[a-f0-9]{32}$/i.test(process.env.R2_ACCOUNT_ID!))
    throw new Error('Unsupported storage account');
  assertBackupObjectKey(process.env.BACKUP_OBJECT_KEY!);
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const abort = new AbortController();
  let remoteBody: { destroy?: (error?: Error) => void } | undefined;
  const timeout = setTimeout(() => {
    abort.abort();
    remoteBody?.destroy?.(new Error('Recovery download exceeded time limit'));
  }, 120000);
  let retained: string | undefined;
  let retainedVerified = false;
  let restoreBytes: Buffer | undefined;
  try {
    const object = await client.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: process.env.BACKUP_OBJECT_KEY!,
      }),
      { abortSignal: abort.signal },
    );
    if (!object.Body || !(Symbol.asyncIterator in object.Body))
      throw new Error('Recovery object unavailable');
    remoteBody = object.Body as { destroy?: (error?: Error) => void };
    const archive = await authenticateRetrievedBackup(
      object.Body as AsyncIterable<Uint8Array>,
      object.ContentLength!,
      process.env.BACKUP_ENCRYPTION_KEY!,
    );
    // Parser validation sees plaintext only after complete GCM authentication.
    restoreBytes = archive.plaintext;
    const databaseBytes =
      archive.archiveKind === 'platform'
        ? decodePlatformBundle(archive.plaintext).database
        : archive.plaintext;
    await new Promise<void>((done, fail) => {
      const child = spawn(
        process.env.PG_RESTORE_PATH || 'pg_restore',
        ['--list'],
        {
          windowsHide: true,
          env: Object.fromEntries(
            [
              'PATH',
              'Path',
              'SystemRoot',
              'WINDIR',
              'TEMP',
              'TMP',
              'HOME',
              'LANG',
            ]
              .filter((name) => process.env[name])
              .map((name) => [name, process.env[name]]),
          ),
          stdio: ['pipe', 'ignore', 'pipe'],
        },
      );
      const timer = setTimeout(() => {
        child.kill();
        fail(new Error('Archive parser timed out'));
      }, 30000);
      child.stderr.resume();
      child.stdin.on('error', () => undefined);
      child.once('error', () => {
        clearTimeout(timer);
        fail(new Error('Archive parser unavailable'));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        code === 0 ? done() : fail(new Error('Archive parser rejected backup'));
      });
      child.stdin.end(databaseBytes);
    });
    if (process.argv.includes('--retain-encrypted')) {
      const workspace = await realpath(resolve(__dirname, '../..'));
      const root = join(workspace, '.recovery');
      await mkdir(root, { recursive: true });
      const actualRoot = await realpath(root);
      if (!actualRoot.startsWith(workspace + sep))
        throw new Error('Recovery root escapes workspace');
      retained = join(actualRoot, `offsite-${randomUUID()}`);
      await mkdir(retained, { mode: 0o700 });
      if (process.platform === 'win32') {
        await new Promise<void>((done, fail) => {
          const identity = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
          if (!process.env.USERDOMAIN || !process.env.USERNAME) {
            fail(new Error('Private recovery identity unavailable'));
            return;
          }
          const child = spawn(
            'icacls.exe',
            [retained!, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)F`],
            { windowsHide: true, stdio: 'ignore' },
          );
          child.once('error', () =>
            fail(new Error('Private recovery permissions unavailable')),
          );
          child.once('close', (code) =>
            code === 0
              ? done()
              : fail(new Error('Private recovery permissions unavailable')),
          );
        });
      }
      await writeFile(join(retained, 'application.pgbk'), archive.encrypted, {
        mode: 0o600,
        flag: 'wx',
      });
      await writeFile(
        join(retained, 'verification.json'),
        JSON.stringify({
          version: 1,
          verifiedAt: new Date().toISOString(),
          source: 'offsite',
          encryptedBytes: archive.encrypted.length,
          sha256: archive.sha256,
          archiveAuthenticated: true,
          postgresArchiveParsed: true,
          restoreVerified: false,
          platformRecoveryVerified: false,
        }),
        { mode: 0o600, flag: 'wx' },
      );
      retainedVerified = true;
    }
    archive.plaintext.fill(0);
    console.log(
      JSON.stringify({
        offsiteRetrieval: 'verified',
        archiveAuthentication: 'verified',
        postgresArchiveParser: 'verified',
        archiveKind: archive.archiveKind,
        encryptedRetention: retainedVerified,
        databaseRestore: 'not performed',
        storageBlobsAndProviderRuntime: 'not verified',
      }),
    );
  } finally {
    restoreBytes?.fill(0);
    clearTimeout(timeout);
    abort.abort();
    remoteBody?.destroy?.();
    client.destroy();
    if (retained && !retainedVerified)
      await rm(retained, { recursive: true, force: true });
  }
}

verify().catch(() => {
  console.error(
    'Off-site verification failed; configuration, credentials and provider diagnostics suppressed.',
  );
  process.exitCode = 1;
});
