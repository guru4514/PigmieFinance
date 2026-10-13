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
      (SELECT count(*)::int FROM public.loan_schedule WHERE paid_amount>0 AND num_nonnulls(paid_principal,paid_interest,paid_fees)=0) AS unknown_historical_paid_components,
      (SELECT count(*)::int FROM public.loan_schedule WHERE principal_component='NaN'::numeric OR interest_component='NaN'::numeric OR due_amount='NaN'::numeric OR paid_amount='NaN'::numeric) AS nonfinite_historical_balances,
      (SELECT count(*)::int FROM public.loan_schedule WHERE paid_amount<0 OR paid_amount>due_amount OR due_amount<principal_component+interest_component OR principal_component<0 OR interest_component<0 OR (status='paid' AND paid_amount<>due_amount)) AS invalid_schedule_balances,
      (SELECT count(*)::int FROM public.loan_schedule WHERE due_amount>principal_component+interest_component) AS schedules_with_existing_fees,
      (SELECT count(*)::int FROM public.loans l WHERE l.status IN ('active','defaulted','closed') AND l.outstanding_balance<>COALESCE((SELECT sum(s.due_amount-s.paid_amount) FROM public.loan_schedule s WHERE s.loan_id=l.id AND s.status<>'waived'),0)) AS schedule_outstanding_mismatches,
      (SELECT count(*)::int FROM public.loans WHERE total_payable-total_collected<>outstanding_balance OR outstanding_balance<0) AS loan_total_mismatches,
      (SELECT count(*)::int FROM public.loans l WHERE l.total_collected<>COALESCE((SELECT sum(c.amount) FROM public.collections c WHERE c.loan_id=l.id AND c.status IN ('recorded','verified')),0)) AS collection_total_mismatches,
      (SELECT count(*)::int FROM public.loans l JOIN public.customers c ON c.id=l.customer_id JOIN public.loan_products p ON p.id=l.loan_product_id WHERE l.organization_id<>c.organization_id OR l.organization_id<>p.organization_id) AS cross_tenant_loans,
      (SELECT count(*)::int FROM public.collections c JOIN public.loans l ON l.id=c.loan_id JOIN public.customers u ON u.id=c.customer_id JOIN public.staff s ON s.id=c.collected_by WHERE c.organization_id<>l.organization_id OR c.organization_id<>u.organization_id OR c.organization_id<>s.organization_id OR c.customer_id<>l.customer_id) AS cross_tenant_or_wrong_customer_payments
    `)
    ).rows[0];
    const mismatchCategories = (
      await client.query(`WITH balances AS (
        SELECT l.*, COALESCE(sum(s.due_amount-s.paid_amount) FILTER (WHERE s.status<>'waived'),0) AS scheduled,
          count(s.id) AS schedule_count,
          COALESCE(sum(s.paid_amount),0) AS scheduled_paid,
          bool_or(s.paid_amount<0 OR s.paid_amount>s.due_amount OR s.due_amount<s.principal_component+s.interest_component OR (s.status='paid' AND s.paid_amount<>s.due_amount)) AS invalid,
          bool_or(s.status='waived') AS waived,
          bool_or(s.due_amount>s.principal_component+s.interest_component) AS fees
        FROM public.loans l LEFT JOIN public.loan_schedule s ON s.loan_id=l.id
        WHERE l.status IN ('active','defaulted','closed') GROUP BY l.id
      ) SELECT status, (schedule_count=0) AS missing_schedule,
          COALESCE(invalid,false) AS invalid_schedule, COALESCE(waived,false) AS waived_rows,
          COALESCE(fees,false) AS fee_rows, (scheduled_paid<>total_collected) AS payment_allocation_difference,
          EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.entity_id=b.id AND a.organization_id=b.organization_id AND a.action='loan.restructured') AS restructure_evidence,
          EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.entity_id=b.id AND a.organization_id=b.organization_id AND a.action='loan.pre_closed') AS closure_evidence,
          count(*)::int AS loans
        FROM balances b WHERE outstanding_balance<>scheduled
        GROUP BY status,missing_schedule,invalid_schedule,waived_rows,fee_rows,payment_allocation_difference,restructure_evidence,closure_evidence
        ORDER BY status,missing_schedule,invalid_schedule,waived_rows,fee_rows,payment_allocation_difference,restructure_evidence,closure_evidence`)
    ).rows;
    const invalidCategories = (
      await client.query(`SELECT
        (paid_amount<0) AS negative_payment,
        (paid_amount>due_amount) AS overpaid,
        (due_amount<principal_component+interest_component) AS components_exceed_due,
        (principal_component<0 OR interest_component<0) AS negative_component,
        (status='paid' AND paid_amount<>due_amount) AS false_paid_status,
        count(*)::int AS rows
        FROM public.loan_schedule
        WHERE paid_amount<0 OR paid_amount>due_amount OR due_amount<principal_component+interest_component OR principal_component<0 OR interest_component<0 OR (status='paid' AND paid_amount<>due_amount)
        GROUP BY negative_payment,overpaid,components_exceed_due,negative_component,false_paid_status`)
    ).rows;
    await client.query('ROLLBACK');
    console.log(
      JSON.stringify({
        environment,
        financialInventory: checks,
        mismatchCategories,
        invalidCategories,
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
