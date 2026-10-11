import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { decryptBackup, encryptedBackupStream } from './backup-format.util';

describe('authenticated backup format', () => {
  async function archive(key: string, bytes: Buffer) {
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.from([bytes]).pipe(
      encryptedBackupStream(key),
    ))
      chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
  it('restores exact bytes with independent nonces', async () => {
    const key = randomBytes(32).toString('hex');
    const source = Buffer.from('Synthetic database archive');
    const first = await archive(key, source);
    const second = await archive(key, source);
    expect(first.equals(second)).toBe(false);
    expect(decryptBackup(first, key)).toEqual(source);
  });
  it('rejects changed header, ciphertext, tag, wrong key and truncation before restore', async () => {
    const key = randomBytes(32).toString('hex');
    const sealed = await archive(key, Buffer.from('Synthetic archive content'));
    for (const index of [0, 8, 20, sealed.length - 1]) {
      const changed = Buffer.from(sealed);
      changed[index] ^= 1;
      expect(() => decryptBackup(changed, key)).toThrow(
        'Backup authentication failed',
      );
    }
    expect(() =>
      decryptBackup(sealed, randomBytes(32).toString('hex')),
    ).toThrow();
    expect(() => decryptBackup(sealed.subarray(0, -1), key)).toThrow();
  });
  it('rejects legacy formats and weak or malformed encryption keys', () => {
    expect(() =>
      decryptBackup(Buffer.alloc(64), randomBytes(32).toString('hex')),
    ).toThrow();
    expect(() => encryptedBackupStream('dummy')).toThrow('32-byte hexadecimal');
  });
});
