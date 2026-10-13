import { createHash } from 'node:crypto';
import { decryptBackup } from './backup-format.util';
import { decodePlatformBundle } from './platform-bundle.util';

export const MAX_RECOVERY_BYTES = 256 * 1024 * 1024;

/** Restrict recovery to objects created by the database backup workflow. */
export function assertBackupObjectKey(value: string): void {
  if (
    !/^backups\/backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.pgbk$/.test(
      value,
    )
  )
    throw new Error('Unsupported recovery object key');
}

/** No unauthenticated plaintext leaves this function, including on truncated downloads. */
export async function authenticateRetrievedBackup(
  body: AsyncIterable<Uint8Array>,
  expectedLength: number,
  key: string,
): Promise<{
  encrypted: Buffer;
  plaintext: Buffer;
  sha256: string;
  archiveKind: 'database' | 'platform';
}> {
  if (
    !Number.isSafeInteger(expectedLength) ||
    expectedLength < 36 ||
    expectedLength > MAX_RECOVERY_BYTES
  )
    throw new Error('Unsupported recovery object size');
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > expectedLength || size > MAX_RECOVERY_BYTES) throw new Error();
      chunks.push(Buffer.from(chunk));
    }
    if (size !== expectedLength) throw new Error();
    const encrypted = Buffer.concat(chunks);
    const plaintext = decryptBackup(encrypted, key);
    const archiveKind = plaintext.subarray(0, 5).equals(Buffer.from('PGDMP'))
      ? 'database'
      : 'platform';
    if (archiveKind === 'platform') decodePlatformBundle(plaintext);
    return {
      encrypted,
      plaintext,
      sha256: createHash('sha256').update(encrypted).digest('hex'),
      archiveKind,
    };
  } catch {
    throw new Error(
      'Retrieved archive is incomplete, unauthenticated or unsupported',
    );
  }
}
