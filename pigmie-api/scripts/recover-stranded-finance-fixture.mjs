import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';

let client;
try {
  assert.ok(
    process.argv.length === 2 ||
      (process.argv.length === 3 && process.argv[2] === '--apply'),
  );
  const config = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(
    config,
    parse(readFileSync(new URL('../.env', import.meta.url))),
  );
  assert.equal(config.STAGING_PROJECT_REF, 'sjelnxrlkrvwjcgqbvre');
  const url = new URL(config.DIRECT_URL);
  for (const key of [
    'sslmode',
    'sslaccept',
    'sslcert',
    'sslrootcert',
    'sslkey',
  ])
    url.searchParams.delete(key);
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
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s'");
  const orgs = (
    await client.query(
      "SELECT id FROM public.organizations WHERE name='Synthetic stabilization '||id::text AND created_at>now()-interval '6 hours' FOR UPDATE",
    )
  ).rows;
  assert.ok(orgs.length <= 1);
  for (const { id } of orgs) {
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM public.staff WHERE organization_id=$1 AND (full_name NOT LIKE 'Synthetic%' OR email NOT IN ('synthetic@example.test','synthetic-admin@example.test','synthetic-replacement@example.test'))",
          [id],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM public.customers WHERE organization_id=$1 AND (full_name<>'Synthetic customer' OR phone<>'synthetic-test-only')",
          [id],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM public.loans WHERE organization_id=$1 AND loan_code NOT LIKE 'SYNTHETIC-%'",
          [id],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM public.loan_products WHERE organization_id=$1 AND name<>'Synthetic product'",
          [id],
        )
      ).rows[0].count,
      0,
    );
    // This recovery is restricted to the failed, pre-upload test phase.
    for (const table of [
      'documents',
      'cash_deposits',
      'approval_requests',
      'branches',
    ])
      assert.equal(
        (
          await client.query(
            `SELECT count(*)::int AS count FROM public.${table} WHERE ${table === 'approval_requests' ? '"organizationId"' : 'organization_id'}=$1`,
            [id],
          )
        ).rows[0].count,
        0,
      );
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM storage.objects WHERE name LIKE $1',
          [id + '/%'],
        )
      ).rows[0].count,
      0,
    );
    if (process.argv[2] === '--apply') {
      for (const table of ['audit_logs', 'collections'])
        await client.query(
          `DELETE FROM public.${table} WHERE organization_id=$1`,
          [id],
        );
      await client.query(
        'DELETE FROM public.loan_schedule WHERE loan_id IN (SELECT id FROM public.loans WHERE organization_id=$1)',
        [id],
      );
      for (const table of ['loans', 'loan_products', 'customers', 'staff'])
        await client.query(
          `DELETE FROM public.${table} WHERE organization_id=$1`,
          [id],
        );
      await client.query('DELETE FROM public.organizations WHERE id=$1', [id]);
      assert.equal(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM public.organizations WHERE id=$1',
            [id],
          )
        ).rows[0].count,
        0,
      );
    }
  }
  await client.query(process.argv[2] === '--apply' ? 'COMMIT' : 'ROLLBACK');
  console.log(
    JSON.stringify({
      isolatedSyntheticFixtures: orgs.length,
      recovery:
        process.argv[2] === '--apply'
          ? 'removed and verified'
          : 'eligibility verified; no deletion',
    }),
  );
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    'Synthetic fixture recovery stopped; no business rows, credentials or raw diagnostics printed.',
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
