import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = fileURLToPath(new URL('../.env.staging', import.meta.url));
const allowed = [
  'APP_ENV',
  'STAGING_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'RUNTIME_DATABASE_URL',
  'DIRECT_URL',
  'PII_ENCRYPTION_KEY',
  'CORS_ORIGIN',
  'PORT',
];

export function validateStaging(config, runtime = {}) {
  const ref = config.STAGING_PROJECT_REF;
  let runtimeRef;
  try {
    runtimeRef = new URL(runtime.SUPABASE_URL).hostname.split('.')[0];
  } catch {
    /* No runtime URL configured. */
  }
  if (config.APP_ENV !== 'staging' || !/^[a-z]{20}$/.test(ref ?? '')) {
    throw new Error(
      'Set APP_ENV=staging and the new staging project reference.',
    );
  }
  if (
    ref === 'yvxtkzxqaqkhyntdszcu' ||
    ref === runtimeRef ||
    config.SUPABASE_URL === runtime.SUPABASE_URL
  ) {
    throw new Error(
      'Staging must be separate from the current runtime project.',
    );
  }
  if (config.SUPABASE_URL !== `https://${ref}.supabase.co`) {
    throw new Error('The Supabase URL does not match the staging reference.');
  }
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    let url;
    try {
      url = new URL(config[key]);
    } catch {
      throw new Error(`${key} must be a staging PostgreSQL URL.`);
    }
    const direct = url.hostname === `db.${ref}.supabase.co`;
    const pooler =
      url.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(url.username) === `postgres.${ref}`;
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      (!direct && !pooler) ||
      !url.password ||
      /REPLACE|YOUR-PASSWORD/i.test(decodeURIComponent(url.password)) ||
      url.pathname !== '/postgres' ||
      (key === 'DIRECT_URL' && pooler && url.port !== '5432')
    ) {
      throw new Error(
        `${key} must identify the staging project; migrations require a direct or session connection.`,
      );
    }
    const verifiedTLS =
      key === 'DATABASE_URL'
        ? url.searchParams.get('sslmode') === 'verify-full' &&
          !!url.searchParams.get('sslrootcert')
        : url.searchParams.get('sslmode') === 'require' &&
          url.searchParams.get('sslaccept') === 'strict' &&
          !!url.searchParams.get('sslcert');
    if (!verifiedTLS)
      throw new Error(
        `${key} must require TLS and verify the Supabase certificate.`,
      );
  }
  if (config.RUNTIME_DATABASE_URL) {
    let url;
    try {
      url = new URL(config.RUNTIME_DATABASE_URL);
    } catch {
      throw new Error(
        'Runtime configuration must be a restricted staging PostgreSQL URL.',
      );
    }
    const direct =
      url.hostname === `db.${ref}.supabase.co` &&
      decodeURIComponent(url.username) === 'pigmie_runtime';
    const pooled =
      url.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(url.username) === `pigmie_runtime.${ref}` &&
      ['5432', '6543'].includes(url.port);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      (!direct && !pooled) ||
      !url.password ||
      /REPLACE|YOUR-PASSWORD/i.test(decodeURIComponent(url.password)) ||
      url.pathname !== '/postgres' ||
      url.searchParams.get('sslmode') !== 'verify-full' ||
      !url.searchParams.get('sslrootcert')
    )
      throw new Error(
        'Runtime connection must identify the staging project, restricted role and verified TLS.',
      );
  }
  if (
    !/^[a-fA-F0-9]{64}$/.test(config.PII_ENCRYPTION_KEY ?? '') ||
    config.PII_ENCRYPTION_KEY === runtime.PII_ENCRYPTION_KEY
  ) {
    throw new Error('Staging needs a new, separate 32-byte encryption key.');
  }
  const secret = config.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (
    !secret ||
    secret.includes('REPLACE') ||
    secret === runtime.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      'Supply the staging service key, separate from runtime credentials.',
    );
  }
  if (!secret.startsWith('sb_secret_')) {
    let claims;
    try {
      claims = JSON.parse(
        Buffer.from(secret.split('.')[1], 'base64url').toString(),
      );
    } catch {
      throw new Error('Invalid staging service key format.');
    }
    if (claims.ref !== ref || claims.role !== 'service_role') {
      throw new Error('The service key does not identify the staging project.');
    }
  }
  if (
    config.CORS_ORIGIN !== 'http://localhost:5174' ||
    config.PORT !== '3001'
  ) {
    throw new Error(
      'Use the isolated local staging ports: web 5174 and API 3001.',
    );
  }
  return Object.fromEntries(allowed.map((key) => [key, config[key]]));
}

export function stagingProcessEnvironment(
  validated,
  command,
  system = {},
  webEnv = {},
) {
  const safeSystem = Object.fromEntries(
    Object.entries(system).filter(([key]) =>
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
  if (command === 'web')
    return {
      ...safeSystem,
      APP_ENV: 'staging',
      ...Object.fromEntries(
        ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_URL'].map(
          (key) => [key, webEnv[key]],
        ),
      ),
      NODE_ENV: 'development',
    };
  if (command === 'start') {
    if (!validated.RUNTIME_DATABASE_URL)
      throw new Error(
        'Provision the restricted staging runtime login before starting the API.',
      );
    return {
      ...safeSystem,
      ...Object.fromEntries(
        [
          'APP_ENV',
          'STAGING_PROJECT_REF',
          'SUPABASE_URL',
          'SUPABASE_SERVICE_ROLE_KEY',
          'RUNTIME_DATABASE_URL',
          'PII_ENCRYPTION_KEY',
          'CORS_ORIGIN',
          'PORT',
        ].map((key) => [key, validated[key]]),
      ),
      NODE_ENV: 'production',
    };
  }
  if (!['status', 'diff'].includes(command))
    throw new Error('Unsupported staging process.');
  return {
    ...safeSystem,
    DATABASE_URL: validated.DATABASE_URL,
    DIRECT_URL: validated.DIRECT_URL,
    APP_ENV: 'staging',
    NODE_ENV: 'production',
    DOTENV_CONFIG_PATH: configPath,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2] ?? 'check';
    if (!['check', 'start', 'status', 'web', 'diff'].includes(command))
      throw new Error('Use check, start, status, web or diff.');
    const config = parse(readFileSync(configPath));
    let runtime = {};
    try {
      runtime = parse(readFileSync(new URL('../.env', import.meta.url)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const validated = validateStaging(config, runtime);
    const webEnv = {};
    if (command === 'web') {
      const publicKey = config.STAGING_PUBLIC_KEY ?? '';
      if (!publicKey.startsWith('sb_publishable_')) {
        let claims;
        try {
          claims = JSON.parse(
            Buffer.from(publicKey.split('.')[1], 'base64url').toString(),
          );
        } catch {
          throw new Error(
            'Supply the staging public key; never use the service key in the browser.',
          );
        }
        if (claims.ref !== config.STAGING_PROJECT_REF || claims.role !== 'anon')
          throw new Error(
            'The public key must identify the staging project and anon role.',
          );
      }
      Object.assign(webEnv, {
        VITE_SUPABASE_URL: validated.SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: publicKey,
        VITE_API_URL: 'http://localhost:3001/api/v1',
      });
    }
    console.log(
      'Staging configuration passed isolation checks. No secret values printed.',
    );
    if (command !== 'check') {
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
      const script =
        command === 'web'
          ? 'node_modules/vite/bin/vite.js'
          : command === 'start'
            ? 'dist/main.js'
            : 'node_modules/prisma/build/index.js';
      const args =
        command === 'status'
          ? ['migrate', 'status']
          : command === 'diff'
            ? [
                'migrate',
                'diff',
                '--from-config-datasource',
                '--to-schema',
                'prisma/schema.prisma',
                '--script',
                '--output',
                '../docs/STAGING_SCHEMA_DIFF.sql',
              ]
            : command === 'web'
              ? [
                  '--mode',
                  'staging',
                  '--port',
                  '5174',
                  '--strictPort',
                  '--host',
                  '127.0.0.1',
                ]
              : [];
      const child = spawn(process.execPath, [script, ...args], {
        cwd:
          command === 'web'
            ? fileURLToPath(new URL('../../pigmie-web/', import.meta.url))
            : root,
        stdio: 'inherit',
        shell: false,
        env: stagingProcessEnvironment(validated, command, system, webEnv),
      });
      child.on('error', () => {
        console.error('Staging process could not start.');
        process.exitCode = 1;
      });
      child.on('exit', (code) => {
        process.exitCode = code ?? 1;
      });
    }
  } catch (error) {
    console.error(
      error.code === 'ENOENT'
        ? 'Create the ignored pigmie-api/.env.staging from the example first.'
        : error.message,
    );
    process.exitCode = 1;
  }
}
