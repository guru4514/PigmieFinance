import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join, sep } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
require('ts-node/register');
const { decryptBackup } = require('../src/common/utils/backup-format.util.ts');
const {
  decodePlatformBundle,
  restorePlatformBundle,
} = require('../src/common/utils/platform-bundle.util.ts');
let plaintext;
try {
  const [name, ...extra] = process.argv.slice(2);
  assert.ok(!extra.length && /^platform-[a-f0-9-]{36}$/.test(name ?? ''));
  const workspace = realpathSync(
    fileURLToPath(new URL('../../', import.meta.url)),
  );
  const root = realpathSync(join(workspace, '.recovery'));
  assert.ok(root.startsWith(workspace + sep));
  const target = realpathSync(resolve(root, name));
  assert.ok(target.startsWith(root + sep));
  const key =
    process.env.BACKUP_ENCRYPTION_KEY ||
    parse(readFileSync(join(target, '.env.local'))).BACKUP_ENCRYPTION_KEY;
  plaintext = decryptBackup(readFileSync(join(target, 'platform.pgbk')), key);
  const verified = decodePlatformBundle(plaintext);
  let databaseParsed = false;
  let objectCount = 0;
  // Exercise the usable restoration reader without remote writes. Database parser and exact blobs are real.
  await restorePlatformBundle(plaintext, {
    restoreDatabase: async (database) => {
      await new Promise((done, fail) => {
        const executable =
          process.env.PG_RESTORE_PATH ||
          join(
            root,
            'pgsql',
            'bin',
            process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore',
          );
        const child = spawn(executable, ['--list'], {
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
        });
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
          code === 0
            ? done()
            : fail(new Error('Archive parser rejected bundle'));
        });
        child.stdin.end(database);
      });
      databaseParsed = true;
    },
    restoreObject: async (object) => {
      const expected = verified.objects[objectCount++];
      assert.equal(object.bucket, expected.bucket);
      assert.equal(object.name, expected.name);
      assert.equal(
        createHash('sha256').update(object.bytes).digest('hex'),
        createHash('sha256').update(expected.bytes).digest('hex'),
      );
      await Promise.resolve();
    },
  });
  assert.equal(objectCount, verified.objects.length);
  console.log(
    JSON.stringify({
      bundleAuthentication: 'verified',
      databaseArchiveParser: databaseParsed,
      restorationReader: 'verified',
      storageObjectCount: objectCount,
      bucketCount: verified.bucketSettings.length,
      remoteWrites: false,
      hostedRuntimeRestore: 'not performed',
      independentEscrow: 'not verified',
    }),
  );
} catch {
  console.error(
    'Platform bundle verification failed; rows, paths, credentials and provider diagnostics suppressed.',
  );
  process.exitCode = 1;
} finally {
  plaintext?.fill(0);
}
