import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import {
  configuration,
  connection,
  exactHistory,
  verifyRole,
} from './deploy-runtime-isolation.mjs';

let operator,
  runtime,
  checkpoint = 'configuration',
  original,
  path,
  written = false,
  committed = false;
try {
  assert.equal(process.argv.length, 3);
  const selected = configuration(process.argv[2]);
  path = selected.path;
  const { config, ref } = selected;
  assert.ok(
    !config.RUNTIME_DATABASE_URL,
    'Existing runtime configuration must be verified, never silently rotated.',
  );
  original = readFileSync(path, 'utf8');
  assert.equal(
    spawnSync('git', ['check-ignore', '--quiet', '--', path], {
      cwd: dirname(path),
      windowsHide: true,
      stdio: 'pipe',
    }).status,
    0,
  );
  operator = connection(config.DIRECT_URL, ref);
  await operator.connect();
  checkpoint = 'applied checksums and restricted NOLOGIN role';
  await exactHistory(operator, true);
  await verifyRole(operator, false);
  assert.equal(
    (
      await operator.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename IN ('pigmie_app','pigmie_runtime')",
      )
    ).rows[0].n,
    0,
  );
  const password = randomBytes(32).toString('hex');
  const url = new URL(config.DATABASE_URL);
  url.username = url.hostname.endsWith('.pooler.supabase.com')
    ? `pigmie_runtime.${ref}`
    : 'pigmie_runtime';
  url.password = password;
  checkpoint = 'secure role activation';
  await operator.query('BEGIN');
  // Hex is generated locally and cannot contain SQL metacharacters. PostgreSQL
  // ALTER ROLE has no parameter binding for PASSWORD; never emit this statement.
  await operator.query(
    `ALTER ROLE pigmie_runtime LOGIN PASSWORD '${password}'`,
  );
  await verifyRole(operator, true);
  checkpoint = 'existing ignored environment configuration';
  writeFileSync(
    path,
    original.replace(/\s*$/, '') +
      `\nRUNTIME_DATABASE_URL="${url.toString()}"\n`,
    { mode: 0o600 },
  );
  written = true;
  await operator.query('COMMIT');
  committed = true;
  checkpoint = 'actual runtime TLS login';
  runtime = connection(url.toString(), ref, true);
  await runtime.connect();
  assert.equal(
    (await runtime.query("SELECT current_user='pigmie_runtime' AS ok")).rows[0]
      .ok,
    true,
  );
  console.log(
    JSON.stringify({
      environment: process.argv[2].slice(2),
      runtimeConfigured: true,
      actualLoginVerified: true,
      operatorUrlsUnchanged: true,
      secretOutput: false,
    }),
  );
} catch {
  await operator?.query('ROLLBACK').catch(() => {});
  if (written && !committed) writeFileSync(path, original, { mode: 0o600 });
  console.error(
    `Runtime configuration stopped at ${checkpoint}; secrets and provider diagnostics suppressed. ${committed ? 'Role and configuration are activated; verify connectivity before retry.' : ''}`,
  );
  process.exitCode = 1;
} finally {
  await runtime?.end().catch(() => {});
  await operator?.end().catch(() => {});
}
