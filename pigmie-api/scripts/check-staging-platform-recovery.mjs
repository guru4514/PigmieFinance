// Exact, journaled synthetic staging object; never touches application/customer records.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';
const workspace = realpathSync(
  fileURLToPath(new URL('../../', import.meta.url)),
);
const root = realpathSync(join(workspace, '.recovery'));
assert.ok(root.startsWith(workspace + sep));
const development = parse(readFileSync(new URL('../.env', import.meta.url)));
const staging = parse(
  readFileSync(new URL('../.env.staging', import.meta.url)),
);
validateStaging(staging, development);
assert.equal(staging.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
  'base64',
);
let fixture = {
  version: 1,
  projectRef: staging.STAGING_PROJECT_REF,
  bucket: 'collection-photos',
  name: `__platform_recovery_verification__/${randomUUID()}/synthetic.png`,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  created: false,
  cleaned: false,
};
let journal = join(root, `fixture-platform-${fixture.name.split('/')[1]}.json`);
const endpoint = `${staging.SUPABASE_URL}/storage/v1`;
const headers = {
  apikey: staging.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${staging.SUPABASE_SERVICE_ROLE_KEY}`,
};
let checkpoint = 'fixture journal';
const options = process.argv.slice(2);
const cleanupOnly = options[0] === '--cleanup';
assert.ok(!options.length || (cleanupOnly && options.length === 2));
if (cleanupOnly) {
  assert.match(options[1], /^fixture-platform-[a-f0-9-]{36}\.json$/);
  journal = realpathSync(join(root, options[1]));
  assert.ok(journal.startsWith(root + sep));
  fixture = JSON.parse(readFileSync(journal, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.projectRef, staging.STAGING_PROJECT_REF);
  assert.equal(fixture.bucket, 'collection-photos');
  assert.match(
    fixture.name,
    /^__platform_recovery_verification__\/[a-f0-9-]{36}\/synthetic\.(png|txt)$/,
  );
  assert.equal(
    options[1],
    `fixture-platform-${fixture.name.split('/')[1]}.json`,
  );
}
function save() {
  writeFileSync(journal, JSON.stringify(fixture), { mode: 0o600 });
}
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
}
async function execute(file, args = []) {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [join(workspace, 'pigmie-api', 'scripts', file), ...args],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '',
      size = 0;
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error('Recovery child timeout'));
    }, 240000);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 32768) {
        child.kill();
        fail(new Error('Recovery child output exceeded'));
      } else output += chunk.toString();
    });
    child.stderr.resume();
    child.once('error', () => {
      clearTimeout(timer);
      fail(new Error('Recovery child unavailable'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      code === 0
        ? done(JSON.parse(output))
        : fail(new Error('Recovery child failed'));
    });
  });
}
try {
  if (!cleanupOnly) {
    writeFileSync(journal, JSON.stringify(fixture), {
      mode: 0o600,
      flag: 'wx',
    });
    checkpoint = 'private bucket validation';
    const bucket = await request(`${endpoint}/bucket/${fixture.bucket}`, {
      headers,
    });
    assert.ok(bucket.ok);
    assert.equal((await bucket.json()).public, false);
    const path = fixture.name.split('/').map(encodeURIComponent).join('/');
    checkpoint = 'synthetic upload';
    const uploaded = await request(
      `${endpoint}/object/${fixture.bucket}/${path}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'image/png',
          'x-upsert': 'false',
        },
        body: bytes,
      },
    );
    assert.ok(uploaded.ok);
    fixture.created = true;
    save();
    const anonymous = await request(
      `${endpoint}/object/public/${fixture.bucket}/${path}`,
    );
    assert.ok(!anonymous.ok);
    checkpoint = 'encrypted snapshot export';
    const exported = await execute('export-platform-bundle.mjs');
    assert.ok(exported.storageObjectCount >= 1);
    const name = exported.artifact.split(/[\\/]/).at(-1);
    assert.match(name, /^platform-[a-f0-9-]{36}$/);
    checkpoint = 'authenticated reader';
    await execute('verify-platform-bundle.mjs', [name]);
    checkpoint = 'isolated database and blob restore';
    const restored = await execute('restore-platform-bundle.mjs', [name]);
    assert.equal(restored.allRestoredBlobBytesMatched, true);
    fixture.artifact = name;
    fixture.restore = restored;
    save();
  }
} catch {
  console.error(
    `Staging platform fixture failed at ${checkpoint}; credentials, paths and provider diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  // A successful upload with interrupted acknowledgment is also covered: remove only this pre-journaled identity.
  try {
    const removed = await request(`${endpoint}/object/${fixture.bucket}`, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [fixture.name] }),
    });
    assert.ok(removed.ok);
    const path = fixture.name.split('/').map(encodeURIComponent).join('/');
    const absent = await request(
      `${endpoint}/object/${fixture.bucket}/${path}`,
      { headers },
    );
    assert.ok(!absent.ok && [400, 404].includes(absent.status));
    fixture.cleaned = true;
    save();
    console.log(
      JSON.stringify({
        privateSyntheticBlob: fixture.created,
        sourceFixtureRemoved: true,
        encryptedBundleRetained: !!fixture.artifact,
        databaseAndBlobRestoreVerified: !!fixture.restore,
        artifact: fixture.artifact,
      }),
    );
  } catch {
    save();
    console.error(
      'Exact staging fixture cleanup requires retry using its journal; no paths or credentials printed.',
    );
    process.exitCode = 1;
  }
  bytes.fill(0);
}
