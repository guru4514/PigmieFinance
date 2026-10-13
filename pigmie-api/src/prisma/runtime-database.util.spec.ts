import {
  runtimeDatabaseConfiguration,
  assertRuntimePrivileges,
} from './runtime-database.util';

const ref = 'abcdefghijklmnopqrst';
const configuration = {
  SUPABASE_URL: `https://${ref}.supabase.co`,
  RUNTIME_DATABASE_URL: `postgresql://pigmie_runtime.${ref}:REPLACE_WITH_DB_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&sslaccept=accept_invalid_certs`,
};
describe('Dedicated database runtime configuration', () => {
  it('pins verified TLS and does not retain weaker URL SSL options', () => {
    const value = runtimeDatabaseConfiguration(configuration);
    expect(value.ssl.rejectUnauthorized).toBe(true);
    expect(value.ssl.ca).toContain('BEGIN CERTIFICATE');
    expect(new URL(value.connectionString).searchParams.has('sslaccept')).toBe(
      false,
    );
  });
  it.each([
    {
      ...configuration,
      RUNTIME_DATABASE_URL: undefined,
      DATABASE_URL: configuration.RUNTIME_DATABASE_URL,
    },
    {
      ...configuration,
      RUNTIME_DATABASE_URL: configuration.RUNTIME_DATABASE_URL.replace(
        'pigmie_runtime.',
        'postgres.',
      ),
    },
    {
      ...configuration,
      SUPABASE_URL: 'https://zyxwvutsrqponmlkjihg.supabase.co',
    },
    { ...configuration, RUNTIME_DATABASE_URL: 'not a connection' },
    {
      ...configuration,
      RUNTIME_DATABASE_URL: configuration.RUNTIME_DATABASE_URL.replace(
        '.pooler.supabase.com',
        '.untrusted.test',
      ),
    },
  ])(
    'rejects missing/operator/foreign configuration without a fallback',
    (config) => {
      expect(() => runtimeDatabaseConfiguration(config)).toThrow(
        'dedicated verified runtime',
      );
    },
  );
  const safe = {
    role: 'pigmie_runtime',
    superuser: false,
    bypass: false,
    createRole: false,
    createDatabase: false,
    owner: false,
    inherited: false,
    member: false,
  };
  it('accepts only the restricted runtime attributes', () =>
    expect(() => assertRuntimePrivileges(safe)).not.toThrow());
  it.each([
    'superuser',
    'bypass',
    'createRole',
    'createDatabase',
    'owner',
    'inherited',
    'member',
  ] as const)('rejects unsafe runtime capability %s', (capability) => {
    expect(() =>
      assertRuntimePrivileges({ ...safe, [capability]: true }),
    ).toThrow('unsafe');
  });
});
