import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// Fixtures/migrations are operator tasks. API PrismaService deliberately cannot
// fall back to these credentials; never instantiate this helper in application code.
export function operatorFixtureClient(config) {
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { Pool } = require('pg');
  const ref = new URL(config.SUPABASE_URL).hostname.split('.')[0];
  assert.ok(['sjelnxrlkrvwjcgqbvre', 'yvxtkzxqaqkhyntdszcu'].includes(ref));
  const url = new URL(config.DIRECT_URL);
  assert.ok(
    (url.hostname === `db.${ref}.supabase.co` &&
      decodeURIComponent(url.username) === 'postgres') ||
      (url.hostname.endsWith('.pooler.supabase.com') &&
        decodeURIComponent(url.username) === `postgres.${ref}` &&
        url.port === '5432'),
  );
  assert.ok(url.password && url.pathname === '/postgres');
  for (const key of [
    'sslmode',
    'sslaccept',
    'sslcert',
    'sslrootcert',
    'sslkey',
  ])
    url.searchParams.delete(key);
  const pool = new Pool({
    connectionString: url.toString(),
    max: 3,
    connectionTimeoutMillis: 15000,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL('../prisma/supabase-ca.crt', import.meta.url),
        'utf8',
      ),
    },
  });
  const client = new PrismaClient({ adapter: new PrismaPg(pool), log: [] });
  const disconnect = client.$disconnect.bind(client);
  let closed = false;
  client.$disconnect = async () => {
    if (closed) return;
    closed = true;
    try {
      await disconnect();
    } finally {
      await pool.end();
    }
  };
  return client;
}
