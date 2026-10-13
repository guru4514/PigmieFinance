import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import pg from 'pg';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';

// This checker makes no source changes and never emits rows, IDs, or credentials.
const require = createRequire(import.meta.url);
let client;
let phase = 'argument validation';
try {
  const mode = process.argv[2] ?? '--both';
  assert.ok(
    process.argv.length <= 3 &&
      ['--both', '--staging', '--development'].includes(mode),
  );
  phase = 'loading the built verifier';
  const {
    reconcileFinancialEvidence,
  } = require('../dist/common/utils/financial-reconciliation.util.js');
  phase = 'fixed environment validation';
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
    if (mode !== '--both' && mode !== `--${environment}`) continue;
    const url = new URL(config.DIRECT_URL);
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
    assert.ok(
      url.hostname === `db.${ref}.supabase.co` ||
        (url.hostname.endsWith('.pooler.supabase.com') &&
          decodeURIComponent(url.username) === `postgres.${ref}` &&
          url.port === '5432'),
    );
    assert.equal(url.pathname, '/postgres');
    assert.ok(url.password);
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
      query_timeout: 35000,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          new URL('../prisma/supabase-ca.crt', import.meta.url),
          'utf8',
        ),
      },
    });
    phase = 'verified database connection';
    await client.connect();
    phase = 'read-only evidence snapshot';
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
    const counts = (
      await client.query(`SELECT
      (SELECT count(*) FROM public.loans)::int AS loans,
      (SELECT count(*) FROM public.loan_schedule)::int AS schedules,
      (SELECT count(*) FROM public.collections)::int AS payments,
      (SELECT count(*) FROM public.loan_amendments)::int AS amendments`)
    ).rows[0];
    assert.ok(
      counts.loans <= 10000 &&
        counts.schedules <= 200000 &&
        counts.payments <= 200000 &&
        counts.amendments <= 100000,
    );
    const bytes = (
      await client.query(`SELECT
      COALESCE((SELECT sum(octet_length(financial_terms::text)) FROM public.loans),0) +
      COALESCE((SELECT sum(octet_length(allocation_details::text)) FROM public.collections),0) +
      COALESCE((SELECT sum(octet_length(before_evidence::text)+octet_length(after_evidence::text)) FROM public.loan_amendments),0) AS total`)
    ).rows[0];
    assert.ok(BigInt(bytes.total) <= 64n * 1024n * 1024n);
    const loans = (
      await client.query(`SELECT l.id, l.organization_id AS "organizationId", l.customer_id AS "customerId",
      c.organization_id AS "customerOrganizationId", p.organization_id AS "productOrganizationId", l.status::text,
      l.start_date::text AS "startDate", l.principal_amount::text AS "principalAmount", l.interest_rate_annual::text AS "interestRateAnnual",
      l.interest_type::text AS "interestType", l.collection_frequency::text AS "collectionFrequency", l.tenure,
      l.total_payable::text AS "totalPayable", l.total_collected::text AS "totalCollected", l.outstanding_balance::text AS "outstandingBalance",
      l.financial_terms AS "financialTerms"
      FROM public.loans l LEFT JOIN public.customers c ON c.id=l.customer_id LEFT JOIN public.loan_products p ON p.id=l.loan_product_id
      ORDER BY l.id`)
    ).rows;
    const schedules = (
      await client.query(`SELECT id, loan_id AS "loanId", installment_number AS "installmentNumber", due_date::text AS "dueDate",
      principal_component::text AS "principalComponent", interest_component::text AS "interestComponent", due_amount::text AS "dueAmount",
      paid_amount::text AS "paidAmount", paid_principal::text AS "paidPrincipal", paid_interest::text AS "paidInterest", paid_fees::text AS "paidFees", status::text
      FROM public.loan_schedule ORDER BY loan_id, installment_number`)
    ).rows;
    const payments = (
      await client.query(`SELECT c.id, c.loan_id AS "loanId", c.organization_id AS "organizationId", c.customer_id AS "customerId",
      s.organization_id AS "collectorOrganizationId", u.organization_id AS "customerOrganizationId", c.amount::text, c.status::text,
      c.collection_date::text AS "collectionDate", to_char(c.collected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "collectedAt",
      to_char(c.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "recordedAt",
      to_char(c.reversed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "reversedAt",
      c.allocation_details AS "allocationDetails" FROM public.collections c
      LEFT JOIN public.staff s ON s.id=c.collected_by LEFT JOIN public.customers u ON u.id=c.customer_id ORDER BY c.loan_id, c.id`)
    ).rows;
    const amendments = (
      await client.query(`SELECT loan_id AS "loanId", organization_id AS "organizationId", version, operation,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      before_evidence AS "beforeEvidence", after_evidence AS "afterEvidence" FROM public.loan_amendments ORDER BY loan_id, version`)
    ).rows;
    await client.query('ROLLBACK');
    await client.end();
    client = undefined;
    phase = 'evidence comparison';
    const group = (entries) => {
      const grouped = new Map();
      for (const entry of entries) {
        const list = grouped.get(entry.loanId) ?? [];
        list.push(entry);
        grouped.set(entry.loanId, list);
      }
      return grouped;
    };
    const scheduleByLoan = group(schedules),
      paymentByLoan = group(payments),
      amendmentByLoan = group(amendments);
    const summary = {
      loans: loans.length,
      consistent: 0,
      incomplete: 0,
      inconsistent: 0,
      missingEvidence: {},
      contradictions: {},
      orphanRows: 0,
    };
    const loanIds = new Set(loans.map((loan) => loan.id));
    for (const entry of [...schedules, ...payments, ...amendments])
      if (!loanIds.has(entry.loanId)) summary.orphanRows++;
    for (const loan of loans) {
      const result = reconcileFinancialEvidence({
        ...loan,
        schedule: scheduleByLoan.get(loan.id) ?? [],
        payments: paymentByLoan.get(loan.id) ?? [],
        amendments: amendmentByLoan.get(loan.id) ?? [],
      });
      summary[result.state]++;
      for (const code of result.missing)
        summary.missingEvidence[code] =
          (summary.missingEvidence[code] ?? 0) + 1;
      for (const code of result.inconsistent)
        summary.contradictions[code] = (summary.contradictions[code] ?? 0) + 1;
    }
    const verified =
      summary.incomplete === 0 &&
      summary.inconsistent === 0 &&
      summary.orphanRows === 0;
    console.log(
      JSON.stringify({
        environment,
        readOnly: true,
        verified,
        summary,
        limit:
          'Evidence comparison does not prove physical cash, borrower acceptance, or reconstruct missing historical contracts/components.',
      }),
    );
    if (!verified) process.exitCode = 2;
  }
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    `Financial reconciliation stopped during ${phase}; records, credentials and diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
