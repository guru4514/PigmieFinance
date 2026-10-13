import { createHash } from 'node:crypto';
import { z } from 'zod';

const MAGIC = Buffer.from('PGMPLT01');
export const MAX_PLATFORM_BUNDLE_BYTES = 256 * 1024 * 1024;
export const MAX_PLATFORM_OBJECT_BYTES = 64 * 1024 * 1024;
const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const contentEntry = z
  .object({
    bytes: z.number().int().nonnegative().max(MAX_PLATFORM_BUNDLE_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const bundleManifest = z
  .object({
    version: z.literal(1),
    sourceProjectRef: z.string().regex(/^[a-z]{20}$/),
    capturedAt: z.iso.datetime(),
    database: contentEntry,
    objects: z
      .array(
        contentEntry.extend({
          bucket: z.string().min(1).max(256),
          name: z.string().min(1).max(4096),
        }),
      )
      .max(10000),
    bucketSettings: z
      .array(
        z
          .object({
            id: z.string().min(1).max(256),
            public: z.boolean(),
            fileSizeLimit: z.number().int().nonnegative().nullable(),
            allowedMimeTypes: z.array(z.string()).nullable(),
          })
          .strict(),
      )
      .max(10000),
    extensions: z
      .array(z.object({ name: z.string(), version: z.string() }).strict())
      .max(1000),
    externalPrerequisites: z.tuple([
      z.literal('independent_pii_key_escrow'),
      z.literal('provider_auth_settings'),
      z.literal('provider_runtime_and_acl_verification'),
    ]),
  })
  .strict();
export type PlatformObject = { bucket: string; name: string; bytes: Buffer };
export type PlatformBundleInput = {
  projectRef: string;
  capturedAt: string;
  database: Buffer;
  objects: PlatformObject[];
  bucketSettings: {
    id: string;
    public: boolean;
    fileSizeLimit: number | null;
    allowedMimeTypes: string[] | null;
  }[];
  extensions: { name: string; version: string }[];
};

/** The entire bundle must be encrypted before persistence; manifest may contain private object paths. */
export function encodePlatformBundle(input: PlatformBundleInput): Buffer {
  const parts = [input.database, ...input.objects.map((item) => item.bytes)];
  const manifest = {
    version: 1,
    sourceProjectRef: input.projectRef,
    capturedAt: input.capturedAt,
    database: { bytes: input.database.length, sha256: sha256(input.database) },
    objects: input.objects.map((item) => ({
      bucket: item.bucket,
      name: item.name,
      bytes: item.bytes.length,
      sha256: sha256(item.bytes),
    })),
    bucketSettings: input.bucketSettings,
    extensions: input.extensions,
    externalPrerequisites: [
      'independent_pii_key_escrow',
      'provider_auth_settings',
      'provider_runtime_and_acl_verification',
    ],
  };
  const json = Buffer.from(JSON.stringify(manifest));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  const total =
    12 + json.length + parts.reduce((sum, part) => sum + part.length, 0);
  if (total > MAX_PLATFORM_BUNDLE_BYTES)
    throw new Error('Platform bundle exceeds supported size');
  const encoded = Buffer.concat([MAGIC, length, json, ...parts]);
  decodePlatformBundle(encoded);
  return encoded;
}

/** Validate every manifest entry and content hash before returning any restore bytes. */
export function decodePlatformBundle(encoded: Buffer): PlatformBundleInput {
  try {
    if (
      encoded.length < 12 ||
      encoded.length > MAX_PLATFORM_BUNDLE_BYTES ||
      !encoded.subarray(0, 8).equals(MAGIC)
    )
      throw new Error();
    const size = encoded.readUInt32BE(8);
    if (size < 2 || size > 1024 * 1024 || 12 + size > encoded.length)
      throw new Error();
    const value = bundleManifest.parse(
      JSON.parse(encoded.subarray(12, 12 + size).toString('utf8')),
    );
    const buckets = new Set<string>();
    for (const setting of value.bucketSettings) {
      if (buckets.has(setting.id)) throw new Error();
      buckets.add(setting.id);
    }
    let offset = 12 + size;
    const read = (entry: { bytes: number; sha256: string }, limit: number) => {
      if (
        !entry ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 0 ||
        entry.bytes > limit ||
        typeof entry.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        offset + entry.bytes > encoded.length
      )
        throw new Error();
      const bytes = encoded.subarray(offset, offset + entry.bytes);
      offset += entry.bytes;
      if (sha256(bytes) !== entry.sha256) throw new Error();
      return bytes;
    };
    const database = read(value.database, MAX_PLATFORM_BUNDLE_BYTES);
    if (!database.subarray(0, 5).equals(Buffer.from('PGDMP')))
      throw new Error();
    const identities = new Set<string>();
    const objects = value.objects.map((item) => {
      if (
        !item ||
        typeof item.bucket !== 'string' ||
        !buckets.has(item.bucket) ||
        typeof item.name !== 'string' ||
        !item.name ||
        item.name.includes('\0') ||
        item.name
          .split('/')
          .some((part: string) => part === '.' || part === '..')
      )
        throw new Error();
      const identity = JSON.stringify([item.bucket, item.name]);
      if (identities.has(identity)) throw new Error();
      identities.add(identity);
      return {
        bucket: item.bucket,
        name: item.name,
        bytes: read(item, MAX_PLATFORM_OBJECT_BYTES),
      };
    });
    if (offset !== encoded.length) throw new Error();
    return {
      projectRef: value.sourceProjectRef,
      capturedAt: value.capturedAt,
      database,
      objects,
      bucketSettings: value.bucketSettings,
      extensions: value.extensions,
    };
  } catch {
    throw new Error('Platform bundle is invalid, incomplete or inconsistent');
  }
}

/** Destination adapters must provide their own identity, maintenance, ACL and rollback safeguards. */
export async function restorePlatformBundle(
  encoded: Buffer,
  destination: {
    restoreDatabase: (database: Buffer) => Promise<void>;
    restoreObject: (object: PlatformObject) => Promise<void>;
  },
): Promise<void> {
  const verified = decodePlatformBundle(encoded);
  await destination.restoreDatabase(verified.database);
  for (const object of verified.objects)
    await destination.restoreObject(object);
}
