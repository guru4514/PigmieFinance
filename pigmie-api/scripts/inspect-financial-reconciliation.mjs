import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';

let client;
try {
  assert.equal(process.argv.length, 2);
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
  for (const [environment, config, ref] of [
    ['development', development, 'yvxtkzxqaqkhyntdszcu'],
    ['staging', staging, 'sjelnxrlkrvwjcgqbvre'],
  ]) {
    const url = new URL(config.DIRECT_URL);
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
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const checks = (
      await client.query(`SELECT
      (SELECT count(*)::int FROM public.loans WHERE financial_terms IS NULL) AS unknown_historical_contracts,
      (SELECT count(*)::int FROM public.collections WHERE allocation_details IS NULL) AS unknown_historical_allocations,
      (SELECT count(*)::int FROM public.loan_schedule WHERE paid_amount<0 OR paid_amount>due_amount OR due_amount<principal_component+interest_component OR principal_component<0 OR interest_component<0 OR (status='paid' AND paid_amount<>due_amount)) AS invalid_schedule_balances,
      (SELECT count(*)::int FROM public.loan_schedule WHERE due_amount>principal_component+interest_component) AS schedules_with_existing_fees,
      (SELECT count(*)::int FROM public.loans l WHERE l.status IN ('active','defaulted','closed') AND l.outstanding_balance<>COALESCE((SELECT sum(s.due_amount-s.paid_amount) FROM public.loan_schedule s WHERE s.loan_id=l.id AND s.status<>'waived'),0)) AS schedule_outstanding_mismatches,
      (SELECT count(*)::int FROM public.loans WHERE total_payable-total_collected<>outstanding_balance OR outstanding_balance<0) AS loan_total_mismatches,
      (SELECT count(*)::int FROM public.loans l WHERE l.total_collected<>COALESCE((SELECT sum(c.amount) FROM public.collections c WHERE c.loan_id=l.id AND c.status='recorded'),0)) AS collection_total_mismatches,
      (SELECT count(*)::int FROM public.loans l JOIN public.customers c ON c.id=l.customer_id JOIN public.loan_products p ON p.id=l.loan_product_id WHERE l.organization_id<>c.organization_id OR l.organization_id<>p.organization_id) AS cross_tenant_loans,
      (SELECT count(*)::int FROM public.collections c JOIN public.loans l ON l.id=c.loan_id JOIN public.customers u ON u.id=c.customer_id JOIN public.staff s ON s.id=c.collected_by WHERE c.organization_id<>l.organization_id OR c.organization_id<>u.organization_id OR c.organization_id<>s.organization_id OR c.customer_id<>l.customer_id) AS cross_tenant_or_wrong_customer_payments
    `)
    ).rows[0];
    await client.query('ROLLBACK');
    console.log(
      JSON.stringify({
        environment,
        financialInventory: checks,
        readOnly: true,
        limit:
          'Unknown historical terms/allocations are preserved; counts do not reconstruct original contracts or prove physical cash.',
      }),
    );
    await client.end();
    client = undefined;
  }
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    'Financial inventory stopped; records, credentials and diagnostics suppressed.',
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
