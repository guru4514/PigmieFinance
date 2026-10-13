import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';
import {
  exactHistory,
  priorNames,
  newNames,
  sourceEvidence,
  rehearseFinancialEvidence,
} from './financial-evidence-migration.mjs';

let client;
let checkpoint = 'configuration';
try {
  const args = process.argv.slice(2);
  const developmentMode = args[0] === '--development';
  const apply = args.at(-1) === '--apply';
  const baseArgs = apply ? args.slice(0, -1) : args;
  assert.ok(
    developmentMode
      ? baseArgs.length === 2
      : baseArgs.length === 1 && baseArgs[0] === '--staging',
  );
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
  const config = developmentMode ? development : staging;
  const ref = developmentMode ? 'yvxtkzxqaqkhyntdszcu' : 'sjelnxrlkrvwjcgqbvre';
  const url = new URL(config.DIRECT_URL);
  assert.ok(
    ['postgres:', 'postgresql:'].includes(url.protocol) && url.password,
  );
  assert.ok(
    url.hostname === `db.${ref}.supabase.co` ||
      (url.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(url.username) === `postgres.${ref}` &&
        url.port === '5432'),
  );
  assert.equal(url.pathname, '/postgres');
  for (const key of [
    'sslmode',
    'sslaccept',
    'sslcert',
    'sslrootcert',
    'sslkey',
  ])
    url.searchParams.delete(key);
  let expectedEvidence;
  if (developmentMode) {
    assert.match(baseArgs[1], /^backup-[a-f0-9-]{36}$/);
    const root = realpathSync(
      fileURLToPath(new URL('../../.recovery/', import.meta.url)),
    );
    const backup = realpathSync(resolve(root, baseArgs[1]));
    assert.ok(backup.startsWith(root + sep));
    const proof = JSON.parse(
      readFileSync(resolve(backup, 'verification.json'), 'utf8'),
    );
    const age = Date.now() - new Date(proof.verifiedAt).getTime();
    assert.ok(
      proof.source === 'development' &&
        proof.restoreVerified === true &&
        proof.archivedHistoryRestored === true &&
        proof.financialEvidenceRehearsal === true &&
        Number.isFinite(age) &&
        age >= 0 &&
        age < 86400000,
    );
    expectedEvidence = proof.financialMigrationSourceEvidence;
    assert.ok(expectedEvidence && typeof expectedEvidence === 'object');
    for (const field of [
      'catalogDigest',
      'dataDigest',
      'historyDigest',
      'archivedDigest',
      'migrationDigest',
    ])
      assert.match(expectedEvidence[field], /^[a-f0-9]{64}$/);
    const require = createRequire(import.meta.url);
    const {
      decryptBackup,
    } = require('../dist/common/utils/backup-format.util.js');
    const key = parse(
      readFileSync(resolve(backup, '.env.local')),
    ).BACKUP_ENCRYPTION_KEY;
    assert.ok(
      decryptBackup(readFileSync(resolve(backup, 'application.pgbk')), key)
        .subarray(0, 5)
        .equals(Buffer.from('PGDMP')),
    );
  }
  client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL('../prisma/supabase-ca.crt', import.meta.url),
        'utf8',
      ),
    },
  });
  checkpoint = 'verified TLS database connection';
  await client.connect();
  checkpoint = 'exact prior migration checksums';
  await exactHistory(client);
  if (developmentMode)
    assert.deepEqual(await sourceEvidence(client), expectedEvidence);
  checkpoint = 'additive DDL, evidence and component rollback rehearsal';
  const result = await rehearseFinancialEvidence(client);
  if (developmentMode)
    assert.deepEqual(await sourceEvidence(client), expectedEvidence);
  console.log(
    JSON.stringify({
      environment: developmentMode ? 'development' : 'staging',
      financialEvidenceRehearsal: 'passed and rolled back',
      ...result,
    }),
  );
  if (apply) {
    checkpoint = 'guarded Prisma deployment';
    // Prisma owns migration registration; never fabricate or edit applied history.
    await exactHistory(client);
    if (developmentMode)
      assert.deepEqual(await sourceEvidence(client), expectedEvidence);
    await client.end();
    client = undefined;
    const system = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        [
          'PATH',
          'SYSTEMROOT',
          'WINDIR',
          'TEMP',
          'TMP',
          'USERPROFILE',
          'APPDATA',
          'LOCALAPPDATA',
          'COMSPEC',
          'PATHEXT',
        ].includes(key.toUpperCase()),
      ),
    );
    const cwd = fileURLToPath(new URL('../', import.meta.url));
    const deploy = spawnSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        cwd,
        env: {
          ...system,
          DIRECT_URL: config.DIRECT_URL,
          DATABASE_URL: config.DATABASE_URL,
          DOTENV_CONFIG_PATH: fileURLToPath(
            new URL(
              developmentMode ? '../.env' : '../.env.staging',
              import.meta.url,
            ),
          ),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
        windowsHide: true,
      },
    );
    assert.equal(deploy.status, 0);
    client = new pg.Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          new URL('../prisma/supabase-ca.crt', import.meta.url),
          'utf8',
        ),
      },
    });
    await client.connect();
    await exactHistory(client, [...priorNames, ...newNames]);
    console.log(
      JSON.stringify({
        environment: developmentMode ? 'development' : 'staging',
        financialEvidenceMigrations:
          'deployed by Prisma and checksums verified',
        providerDiagnosticsSuppressed: true,
      }),
    );
  }
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    `Financial evidence operation stopped at ${checkpoint}; secrets and provider diagnostics suppressed. Check migration status before retrying.`,
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
