import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { encryptedBackupStream } from './backup-format.util';
import { encodePlatformBundle } from './platform-bundle.util';
import {
  assertBackupObjectKey,
  authenticateRetrievedBackup,
  MAX_RECOVERY_BYTES,
} from './backup-retrieval.util';

describe('off-site recovery admission', () => {
  const key = randomBytes(32).toString('hex');
  async function seal(plain: Buffer = Buffer.from('PGDMP synthetic archive')) {
    const chunks: Buffer[] = [];
    for await (const part of Readable.from([plain]).pipe(
      encryptedBackupStream(key),
    ))
      chunks.push(part as Buffer);
    return Buffer.concat(chunks);
  }
  it('accepts only generated database archive paths', () => {
    expect(() =>
      assertBackupObjectKey('backups/backup-2026-10-11T00-00-00-000Z.pgbk'),
    ).not.toThrow();
    for (const value of [
      '../.env',
      'backups/../../.env',
      'https://example.test/archive',
      'backups/file.pgbk',
    ])
      expect(() => assertBackupObjectKey(value)).toThrow();
  });
  it('authenticates a streamed archive before returning exact restore bytes', async () => {
    const encrypted = await seal();
    const result = await authenticateRetrievedBackup(
      Readable.from([encrypted.subarray(0, 22), encrypted.subarray(22)]),
      encrypted.length,
      key,
    );
    expect(result.plaintext).toEqual(Buffer.from('PGDMP synthetic archive'));
    expect(result.encrypted).toEqual(encrypted);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects missing, oversized, fractional and out-of-bounds length metadata', async () => {
    for (const length of [NaN, -1, 0, 35, 50.5, MAX_RECOVERY_BYTES + 1])
      await expect(
        authenticateRetrievedBackup(Readable.from([]), length, key),
      ).rejects.toThrow();
  });
  it('rejects truncation and bytes beyond declared length', async () => {
    const encrypted = await seal();
    for (const length of [encrypted.length - 1, encrypted.length + 1])
      await expect(
        authenticateRetrievedBackup(Readable.from([encrypted]), length, key),
      ).rejects.toThrow();
  });
  it('rejects wrong keys and corrupt objects without exposing data', async () => {
    const encrypted = await seal();
    await expect(
      authenticateRetrievedBackup(
        Readable.from([encrypted]),
        encrypted.length,
        randomBytes(32).toString('hex'),
      ),
    ).rejects.toThrow('unauthenticated');
    encrypted[22] ^= 1;
    await expect(
      authenticateRetrievedBackup(
        Readable.from([encrypted]),
        encrypted.length,
        key,
      ),
    ).rejects.toThrow('unauthenticated');
  });
  it('rejects authenticated non-PostgreSQL payloads', async () => {
    const encrypted = await seal(Buffer.from('not a PostgreSQL dump'));
    await expect(
      authenticateRetrievedBackup(
        Readable.from([encrypted]),
        encrypted.length,
        key,
      ),
    ).rejects.toThrow('unsupported');
  });
  it('authenticates complete platform archives and validates all their entries', async () => {
    const bundle = encodePlatformBundle({
      projectRef: 'abcdefghijklmnopqrst',
      capturedAt: '2026-10-11T00:00:00.000Z',
      database: Buffer.from('PGDMP synthetic database'),
      objects: [],
      bucketSettings: [],
      extensions: [],
    });
    const encrypted = await seal(bundle);
    const verified = await authenticateRetrievedBackup(
      Readable.from([encrypted]),
      encrypted.length,
      key,
    );
    expect(verified.archiveKind).toBe('platform');
    expect(verified.plaintext).toEqual(bundle);
    bundle[bundle.length - 1] ^= 1;
    const invalid = await seal(bundle);
    await expect(
      authenticateRetrievedBackup(
        Readable.from([invalid]),
        invalid.length,
        key,
      ),
    ).rejects.toThrow('unsupported');
  });
  it('suppresses remote stream diagnostics', async () => {
    async function* failed() {
      yield await Promise.reject(new Error('private provider diagnostic'));
    }
    await expect(
      authenticateRetrievedBackup(failed(), 36, key),
    ).rejects.toThrow('Retrieved archive is incomplete');
  });
});
