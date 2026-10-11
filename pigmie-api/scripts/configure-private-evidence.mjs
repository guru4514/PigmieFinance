import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { validateStaging } from './staging.mjs';

try {
  assert.deepEqual(process.argv.slice(2), ['--apply']);
  const development = parse(readFileSync(new URL('../.env', import.meta.url)));
  const staging = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(staging, development);
  assert.equal(
    development.SUPABASE_URL,
    'https://yvxtkzxqaqkhyntdszcu.supabase.co',
  );
  assert.equal(staging.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
  for (const [environment, config] of [
    ['development', development],
    ['staging', staging],
  ]) {
    const storage = createClient(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
        },
      },
    ).storage;
    for (const bucket of ['collection-photos', 'kyc-documents']) {
      const current = await storage.getBucket(bucket);
      const options = {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: [
          'image/png',
          'image/jpeg',
          'image/webp',
          'application/pdf',
        ],
      };
      if (current.error) {
        assert.equal(
          Number(current.error.statusCode ?? current.error.status),
          404,
        );
        const created = await storage.createBucket(bucket, options);
        assert.equal(created.error, null);
      } else {
        const updated = await storage.updateBucket(bucket, options);
        assert.equal(updated.error, null);
      }
      const verified = await storage.getBucket(bucket);
      assert.equal(verified.error, null);
      assert.equal(verified.data.public, false);
      assert.equal(
        Number(verified.data.file_size_limit),
        options.fileSizeLimit,
      );
      assert.deepEqual(
        [...verified.data.allowed_mime_types].sort(),
        [...options.allowedMimeTypes].sort(),
      );
      console.log(
        JSON.stringify({
          environment,
          bucket,
          private: true,
          sizeLimitMB: 10,
          supportedTypes:
            'PNG, JPEG, WebP and PDF; collection registration still requires an image',
        }),
      );
    }
  }
} catch {
  console.error(
    'Private evidence configuration stopped; provider diagnostics suppressed. Rerun safely to verify any completed steps.',
  );
  process.exitCode = 1;
}
