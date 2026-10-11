import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Transform, TransformCallback } from 'node:stream';

const MAGIC = Buffer.from('PGMBK002');
const HEADER_SIZE = 20;
const TAG_SIZE = 16;

function keyBytes(key: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error('Backup requires a 32-byte hexadecimal key');
  return Buffer.from(key, 'hex');
}

/** Version 2: authenticated header, random GCM nonce, ciphertext, then 16-byte tag. */
export function encryptedBackupStream(key: string): Transform {
  const header = Buffer.concat([MAGIC, randomBytes(12)]);
  const cipher = createCipheriv(
    'aes-256-gcm',
    keyBytes(key),
    header.subarray(8),
  );
  cipher.setAAD(header);
  let started = false;
  return new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback,
    ) {
      try {
        if (!started) {
          this.push(header);
          started = true;
        }
        this.push(cipher.update(chunk));
        callback();
      } catch {
        callback(new Error('Backup encryption failed'));
      }
    },
    flush(callback: TransformCallback) {
      try {
        if (!started) this.push(header);
        this.push(cipher.final());
        this.push(cipher.getAuthTag());
        callback();
      } catch {
        callback(new Error('Backup encryption failed'));
      }
    },
  });
}

/** Authenticate the entire archive before returning any bytes to a restore process. */
export function decryptBackup(archive: Buffer, key: string): Buffer {
  try {
    if (
      archive.length < HEADER_SIZE + TAG_SIZE ||
      !archive.subarray(0, 8).equals(MAGIC)
    )
      throw new Error();
    const header = archive.subarray(0, HEADER_SIZE);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyBytes(key),
      header.subarray(8),
    );
    decipher.setAAD(header);
    decipher.setAuthTag(archive.subarray(-TAG_SIZE));
    return Buffer.concat([
      decipher.update(archive.subarray(HEADER_SIZE, -TAG_SIZE)),
      decipher.final(),
    ]);
  } catch {
    throw new Error('Backup authentication failed or format unsupported');
  }
}
