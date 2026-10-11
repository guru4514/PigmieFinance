import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import pg from 'pg';
import { validateStaging } from './staging.mjs';
import { dataEvidence } from './baseline-reconciliation.mjs';

let client;
let checkpoint = 'configuration';
try {
  assert.deepEqual(process.argv.slice(2), []);
  const runtime = parse(readFileSync(new URL('../.env', import.meta.url)));
  const config = parse(
    readFileSync(new URL('../.env.staging', import.meta.url)),
  );
  validateStaging(config, runtime);
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
  const before = await dataEvidence(client);
  const history = (
    await client.query(
      'SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
    )
  ).rows.map((row) => row.migration_name);
  assert.deepEqual(history, [
    '0001_init',
    '0002_staff_totp_secret',
    '0003_align_application_schema',
    '0004_financial_query_indexes',
  ]);
  checkpoint = 'additive migration';
  const sql = readFileSync(
    new URL(
      '../prisma/migrations/0005_financial_contract_evidence/migration.sql',
      import.meta.url,
    ),
    'utf8',
  )
    .replace(/^BEGIN;\s*$/m, '')
    .replace(/^COMMIT;\s*$/m, '');
  await client.query(sql);
  // Existing rows retain NULL evidence; do not infer historical allocations.
  assert.equal(
    (
      await client.query(
        'SELECT count(*)::int AS count FROM public.loans WHERE financial_terms IS NOT NULL',
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await client.query(
        'SELECT count(*)::int AS count FROM public.collections WHERE allocation_details IS NOT NULL',
      )
    ).rows[0].count,
    0,
  );
  checkpoint = 'synthetic evidence constraints';
  const org = randomUUID(),
    customer = randomUUID(),
    product = randomUUID(),
    staff = randomUUID(),
    loan = randomUUID(),
    payment = randomUUID();
  await client.query(
    "INSERT INTO public.organizations(id,name) VALUES($1,'Synthetic contract verification')",
    [org],
  );
  await client.query(
    "INSERT INTO public.customers(id,organization_id,full_name,phone) VALUES($1,$2,'Synthetic','test')",
    [customer, org],
  );
  await client.query(
    "INSERT INTO public.staff(id,organization_id,auth_user_id,full_name,email,role) VALUES($1,$2,$3,'Synthetic','synthetic@example.test','org_admin')",
    [staff, org, randomUUID()],
  );
  await client.query(
    "INSERT INTO public.loan_products(id,organization_id,name,interest_type,interest_rate_annual,collection_frequency,min_amount,max_amount,min_tenure,max_tenure) VALUES($1,$2,'Synthetic','flat',12,'daily',1,1000,1,30)",
    [product, org],
  );
  await client.query(
    "INSERT INTO public.loans(id,organization_id,customer_id,loan_product_id,loan_code,principal_amount,interest_type,interest_rate_annual,collection_frequency,tenure,installment_amount,total_payable,outstanding_balance,status,financial_terms) VALUES($1,$2,$3,$4,$5,100,'flat',12,'daily',1,110,110,110,'active',$6)",
    [
      loan,
      org,
      customer,
      product,
      randomUUID(),
      { version: 1, processingFee: '0.00' },
    ],
  );
  await client.query(
    "INSERT INTO public.collections(id,client_generated_id,organization_id,loan_id,customer_id,collected_by,amount,collection_date,collected_at,collection_method,allocation_details) VALUES($1,$2,$3,$4,$5,$6,55,current_date,now(),'cash',$7)",
    [
      payment,
      randomUUID(),
      org,
      loan,
      customer,
      staff,
      { version: 1, rows: [{ scheduleId: randomUUID(), amount: '55.00' }] },
    ],
  );
  async function denied(sql, values) {
    await client.query('SAVEPOINT invalid_evidence');
    let rejected = false;
    try {
      await client.query(sql, values);
    } catch (error) {
      rejected = error.code === '23514';
    }
    await client.query('ROLLBACK TO SAVEPOINT invalid_evidence');
    assert.equal(rejected, true);
  }
  await denied('UPDATE public.loans SET financial_terms=$1 WHERE id=$2', [
    { version: 1, processingFee: '1.00' },
    loan,
  ]);
  await denied(
    'UPDATE public.collections SET allocation_details=NULL WHERE id=$1',
    [payment],
  );
  await denied(
    'UPDATE public.collections SET allocation_details=$1 WHERE id=$2',
    [{ version: 1, rows: [] }, payment],
  );
  // Check invalid INSERT evidence separately: UPDATE fails the immutability guard.
  await denied(
    "INSERT INTO public.loans(id,organization_id,customer_id,loan_product_id,loan_code,principal_amount,interest_type,interest_rate_annual,collection_frequency,tenure,installment_amount,total_payable,outstanding_balance,financial_terms) VALUES($1,$2,$3,$4,$5,100,'flat',12,'daily',1,110,110,110,$6)",
    [randomUUID(), org, customer, product, randomUUID(), {}],
  );
  await client.query(
    "UPDATE public.collections SET status='reversed' WHERE id=$1",
    [payment],
  );
  await client.query('ROLLBACK');
  assert.deepEqual(await dataEvidence(client), before);
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('financial_terms','allocation_details')",
      )
    ).rows[0].count,
    0,
  );
  console.log(
    JSON.stringify({
      financialContractMigration: 'rehearsed and rolled back',
      immutableTerms: true,
      immutablePaymentAllocation: true,
      invalidInsertDenied: true,
      statusUpdatesAllowed: true,
      originalRowsUnchanged: true,
    }),
  );
} catch {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(
    `Financial contract migration stopped at ${checkpoint}; credentials and SQL diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
