import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function runtimeDatabaseConfiguration(environment: NodeJS.ProcessEnv) {
  try {
    if (!environment.RUNTIME_DATABASE_URL || !environment.SUPABASE_URL)
      throw new Error();
    const url = new URL(environment.RUNTIME_DATABASE_URL);
    const provider = new URL(environment.SUPABASE_URL);
    const ref = provider.hostname.split('.')[0];
    if (
      provider.protocol !== 'https:' ||
      provider.hostname !== `${ref}.supabase.co`
    )
      throw new Error();
    const direct =
      url.hostname === `db.${ref}.supabase.co` &&
      decodeURIComponent(url.username) === 'pigmie_runtime';
    const pooled =
      url.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(url.username) === `pigmie_runtime.${ref}` &&
      ['5432', '6543'].includes(url.port);
    if (
      !/^[a-z0-9]{20}$/.test(ref) ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.password ||
      url.pathname !== '/postgres' ||
      (!direct && !pooled)
    )
      throw new Error();
    for (const key of [
      'sslmode',
      'sslaccept',
      'sslcert',
      'sslrootcert',
      'sslkey',
    ])
      url.searchParams.delete(key);
    return {
      connectionString: url.toString(),
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          resolve(__dirname, '../../prisma/supabase-ca.crt'),
          'utf8',
        ),
      },
    };
  } catch {
    throw new Error(
      'A dedicated verified runtime database configuration is required',
    );
  }
}

export function assertRuntimePrivileges(row: {
  role: string;
  superuser: boolean;
  bypass: boolean;
  createRole: boolean;
  createDatabase: boolean;
  owner: boolean;
  inherited: boolean;
  member: boolean;
}) {
  if (
    row.role !== 'pigmie_runtime' ||
    row.superuser ||
    row.bypass ||
    row.createRole ||
    row.createDatabase ||
    row.owner ||
    row.inherited ||
    row.member
  ) {
    throw new Error('Runtime database privileges are unsafe');
  }
}
