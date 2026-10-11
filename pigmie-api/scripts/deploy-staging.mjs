import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';

// Deployment is gated by a rolled-back dry-run against the expected history.
try {
  const configFile = fileURLToPath(new URL('../.env.staging', import.meta.url));
  const config = parse(readFileSync(configFile));
  const runtime = parse(readFileSync(new URL('../.env', import.meta.url)));
  const safe = validateStaging(config, runtime);
  if (safe.STAGING_PROJECT_REF !== 'sjelnxrlkrvwjcgqbvre')
    throw new Error('Unexpected project.');
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const dryRun = spawnSync(
    process.execPath,
    [
      process.argv[2] === 'indexes'
        ? 'scripts/check-staging-indexes.mjs'
        : 'scripts/check-staging-migrations.mjs',
    ],
    { cwd, stdio: 'inherit', timeout: 60000 },
  );
  if (dryRun.status !== 0)
    throw new Error(
      'The empty-database migration dry-run must pass before first deployment.',
    );
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
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd,
      stdio: 'inherit',
      timeout: 60000,
      env: {
        ...system,
        ...safe,
        DOTENV_CONFIG_PATH: configFile,
        NODE_ENV: 'production',
      },
    },
  );
  process.exitCode = result.status ?? 1;
} catch {
  console.error(
    'Staging deployment stopped. No credentials printed. Inspect the preceding verification result.',
  );
  process.exitCode = 1;
}
