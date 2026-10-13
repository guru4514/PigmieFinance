import {
  decodePlatformBundle,
  encodePlatformBundle,
  PlatformBundleInput,
  restorePlatformBundle,
} from './platform-bundle.util';

describe('complete platform recovery bundle', () => {
  const fixture = (): PlatformBundleInput => ({
    projectRef: 'abcdefghijklmnopqrst',
    capturedAt: '2026-10-11T00:00:00.000Z',
    database: Buffer.from('PGDMP synthetic database'),
    objects: [
      {
        bucket: 'private',
        name: 'org/document',
        bytes: Buffer.from('synthetic evidence'),
      },
    ],
    bucketSettings: [
      {
        id: 'private',
        public: false,
        fileSizeLimit: null,
        allowedMimeTypes: null,
      },
    ],
    extensions: [{ name: 'pgcrypto', version: '1.3' }],
  });
  it('returns exact database, blobs and private bucket settings', () => {
    const original = fixture();
    expect(decodePlatformBundle(encodePlatformBundle(original))).toEqual(
      original,
    );
  });
  it('supports a truly empty Storage source', () => {
    const source = fixture();
    source.objects = [];
    source.bucketSettings = [];
    expect(decodePlatformBundle(encodePlatformBundle(source)).objects).toEqual(
      [],
    );
  });
  it('rejects corruption of database or any blob', () => {
    const encoded = encodePlatformBundle(fixture());
    const offset = 12 + encoded.readUInt32BE(8);
    for (const position of [offset, encoded.length - 1]) {
      const broken = Buffer.from(encoded);
      broken[position] ^= 1;
      expect(() => decodePlatformBundle(broken)).toThrow('invalid');
    }
  });
  it('rejects missing and unmanifested trailing bytes', () => {
    const encoded = encodePlatformBundle(fixture());
    expect(() => decodePlatformBundle(encoded.subarray(0, -1))).toThrow();
    expect(() =>
      decodePlatformBundle(Buffer.concat([encoded, Buffer.from('extra')])),
    ).toThrow();
  });
  it('rejects duplicate objects, missing buckets and unsafe paths', () => {
    const duplicate = fixture();
    duplicate.objects.push(duplicate.objects[0]);
    expect(() => encodePlatformBundle(duplicate)).toThrow();
    const missing = fixture();
    missing.bucketSettings = [];
    expect(() => encodePlatformBundle(missing)).toThrow();
    const traversal = fixture();
    traversal.objects[0].name = '../secret';
    expect(() => encodePlatformBundle(traversal)).toThrow();
  });
  it('rejects repeated bucket definitions and unsupported database bytes', () => {
    const duplicate = fixture();
    duplicate.bucketSettings.push(duplicate.bucketSettings[0]);
    expect(() => encodePlatformBundle(duplicate)).toThrow();
    const wrong = fixture();
    wrong.database = Buffer.from('plaintext SQL');
    expect(() => encodePlatformBundle(wrong)).toThrow();
  });
  it('rejects unknown format versions and forged lengths', () => {
    const encoded = encodePlatformBundle(fixture());
    const version = Buffer.from(encoded);
    version[7] ^= 1;
    expect(() => decodePlatformBundle(version)).toThrow();
    const length = Buffer.from(encoded);
    length.writeUInt32BE(0xffffffff, 8);
    expect(() => decodePlatformBundle(length)).toThrow();
  });
  it('validates all bytes before invoking any restore adapter', async () => {
    const encoded = encodePlatformBundle(fixture());
    encoded[encoded.length - 1] ^= 1;
    const destination = {
      restoreDatabase: jest.fn().mockResolvedValue(undefined),
      restoreObject: jest.fn().mockResolvedValue(undefined),
    };
    await expect(restorePlatformBundle(encoded, destination)).rejects.toThrow();
    expect(destination.restoreDatabase).not.toHaveBeenCalled();
    expect(destination.restoreObject).not.toHaveBeenCalled();
  });
  it('provides only validated exact bytes to destination adapters', async () => {
    const source = fixture();
    const destination = {
      restoreDatabase: jest.fn().mockResolvedValue(undefined),
      restoreObject: jest.fn().mockResolvedValue(undefined),
    };
    await restorePlatformBundle(encodePlatformBundle(source), destination);
    expect(destination.restoreDatabase).toHaveBeenCalledWith(source.database);
    expect(destination.restoreObject).toHaveBeenCalledWith(source.objects[0]);
  });
});
