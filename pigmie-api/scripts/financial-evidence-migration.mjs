import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  baselineCatalog,
  dataEvidence,
  digest,
  migrationEvidence,
} from './baseline-reconciliation.mjs';

export const priorNames = [
  '0001_init',
  '0002_staff_totp_secret',
  '0003_align_application_schema',
  '0004_financial_query_indexes',
  '0005_financial_contract_evidence',
];
export const newNames = [
  '0006_immutable_loan_amendments',
  '0007_financial_components',
];
export async function exactHistory(client, expected = priorNames) {
  const files = migrationEvidence();
  assert.deepEqual(
    files.map((row) => row.name),
    [...priorNames, ...newNames],
  );
  const history = (
    await client.query(
      'SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY migration_name',
    )
  ).rows;
  assert.deepEqual(
    history.map((row) => row.migration_name),
    expected,
  );
  for (const row of history) {
    assert.ok(row.finished_at && !row.rolled_back_at);
    assert.equal(
      row.checksum,
      files.find((file) => file.name === row.migration_name).checksum,
    );
  }
  return history;
}
export async function sourceEvidence(client) {
  const archived = (
    await client.query(
      'SELECT * FROM pigmie_migration_evidence.original_history ORDER BY id',
    )
  ).rows;
  return {
    catalogDigest: digest(await baselineCatalog(client)),
    dataDigest: digest(await dataEvidence(client)),
    historyDigest: digest(
      (
        await client.query(
          'SELECT * FROM public._prisma_migrations ORDER BY id',
        )
      ).rows,
    ),
    archivedDigest: digest(archived),
    migrationDigest: digest(migrationEvidence()),
  };
}
export async function rehearseFinancialEvidence(client) {
  await exactHistory(client);
  const beforeCatalog = await baselineCatalog(client);
  const beforeRows = await dataEvidence(client);
  const history = (
    await client.query('SELECT * FROM public._prisma_migrations ORDER BY id')
  ).rows;
  const archived = (
    await client.query(
      "SELECT to_regclass('pigmie_migration_evidence.original_history') IS NOT NULL AS present",
    )
  ).rows[0].present
    ? (
        await client.query(
          'SELECT * FROM pigmie_migration_evidence.original_history ORDER BY id',
        )
      ).rows
    : null;
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    for (const name of newNames)
      await client.query(
        readFileSync(
          new URL(
            `../prisma/migrations/${name}/migration.sql`,
            import.meta.url,
          ),
          'utf8',
        )
          .replace(/^BEGIN;\s*$/m, '')
          .replace(/^COMMIT;\s*$/m, ''),
      );
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM public.loan_schedule WHERE paid_principal IS NOT NULL OR paid_interest IS NOT NULL OR paid_fees IS NOT NULL',
        )
      ).rows[0].count,
      0,
    );
    const org = randomUUID(),
      foreignOrg = randomUUID(),
      customer = randomUUID(),
      staff = randomUUID(),
      foreignStaff = randomUUID(),
      product = randomUUID();
    await client.query(
      "INSERT INTO public.organizations(id,name) VALUES($1,'Synthetic immutable evidence verification'),($2,'Synthetic foreign evidence verification')",
      [org, foreignOrg],
    );
    await client.query(
      "INSERT INTO public.customers(id,organization_id,full_name,phone) VALUES($1,$2,'Synthetic','test')",
      [customer, org],
    );
    for (const [actor, tenant] of [
      [staff, org],
      [foreignStaff, foreignOrg],
    ])
      await client.query(
        "INSERT INTO public.staff(id,organization_id,auth_user_id,full_name,email,role) VALUES($1,$2,$3,'Synthetic','synthetic@example.test','org_admin')",
        [actor, tenant, randomUUID()],
      );
    await client.query(
      "INSERT INTO public.loan_products(id,organization_id,name,interest_type,interest_rate_annual,collection_frequency,min_amount,max_amount,min_tenure,max_tenure) VALUES($1,$2,'Synthetic','flat',12,'daily',1,1000,1,30)",
      [product, org],
    );
    const createLoan = async () => {
      const id = randomUUID();
      await client.query(
        "INSERT INTO public.loans(id,organization_id,customer_id,loan_product_id,loan_code,principal_amount,interest_type,interest_rate_annual,collection_frequency,tenure,installment_amount,total_payable,outstanding_balance,status) VALUES($1,$2,$3,$4,$5,100,'flat',12,'daily',1,110,110,110,'active')",
        [id, org, customer, product, randomUUID()],
      );
      return id;
    };
    const loan = await createLoan();
    const before = {
      evidenceVersion: 1,
      financialTerms: null,
      replacedSchedule: [],
    };
    const after = {
      evidenceVersion: 1,
      borrowerAcceptance: 'not_recorded',
      replacementSchedule: [],
    };
    await client.query("SELECT set_config('app.current_org_id',$1,true)", [
      org,
    ]);
    const insert =
      'INSERT INTO public.loan_amendments(id,organization_id,loan_id,actor_staff_id,version,operation,before_evidence,after_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)';
    const values = (
      version = 1,
      actor = staff,
      tenant = org,
      previous = before,
      next = after,
      operation = 'restructure',
    ) => [
      randomUUID(),
      tenant,
      loan,
      actor,
      version,
      operation,
      previous,
      next,
    ];
    async function denied(sql, params, code = '23514') {
      await client.query('SAVEPOINT invalid_evidence');
      let rejected = false;
      try {
        await client.query(sql, params);
      } catch (error) {
        rejected = error.code === code;
      }
      await client.query('ROLLBACK TO SAVEPOINT invalid_evidence');
      assert.equal(rejected, true);
    }
    await denied(insert, values(2));
    await denied(insert, values(1, foreignStaff));
    await denied(insert, values(1, staff, foreignOrg));
    await denied(insert, values(1, staff, org, {}));
    await denied(insert, values(1, staff, org, before, { evidenceVersion: 1 }));
    await denied(insert, values(1, staff, org, before, after, 'other'));
    await client.query('UPDATE public.staff SET is_active=false WHERE id=$1', [
      staff,
    ]);
    await denied(insert, values());
    await client.query('UPDATE public.staff SET is_active=true WHERE id=$1', [
      staff,
    ]);
    await client.query("UPDATE public.staff SET role='agent' WHERE id=$1", [
      staff,
    ]);
    await denied(insert, values());
    await client.query("UPDATE public.staff SET role='org_admin' WHERE id=$1", [
      staff,
    ]);
    const amendment = values();
    await client.query(insert, amendment);
    await denied('DELETE FROM public.staff WHERE id=$1', [staff], '23503');
    await denied('UPDATE public.loan_amendments SET reason=$1 WHERE id=$2', [
      'changed',
      amendment[0],
    ]);
    await denied('DELETE FROM public.loan_amendments WHERE id=$1', [
      amendment[0],
    ]);
    await denied(insert, values(1));
    await client.query(insert, values(2));
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM public.loan_amendments WHERE loan_id=$1',
          [loan],
        )
      ).rows[0].count,
      2,
    );
    const row = randomUUID();
    await client.query(
      'INSERT INTO public.loan_schedule(id,loan_id,installment_number,due_date,principal_component,interest_component,due_amount,paid_amount,paid_principal,paid_interest,paid_fees) VALUES($1,$2,1,current_date,100,10,110,0,0,0,0)',
      [row, loan],
    );
    await denied(
      'UPDATE public.loan_schedule SET paid_principal=1 WHERE id=$1',
      [row],
    );
    await denied(
      'UPDATE public.loan_schedule SET paid_principal=NULL WHERE id=$1',
      [row],
    );
    await denied(
      'UPDATE public.loan_schedule SET paid_principal=NULL,paid_interest=NULL,paid_fees=NULL WHERE id=$1',
      [row],
    );
    await denied(
      "UPDATE public.loan_schedule SET paid_amount='NaN',paid_principal='NaN',principal_component='NaN',due_amount='NaN' WHERE id=$1",
      [row],
    );
    await denied(
      'UPDATE public.loan_schedule SET paid_amount=1,paid_principal=-1,paid_interest=2 WHERE id=$1',
      [row],
    );
    await client.query(
      'UPDATE public.loan_schedule SET paid_amount=11,paid_principal=10,paid_interest=1 WHERE id=$1',
      [row],
    );
    const privileges = (
      await client.query(
        "SELECT role,privilege,has_table_privilege(role,'public.loan_amendments',privilege) AS allowed FROM unnest(ARRAY['anon','authenticated']) role CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege",
      )
    ).rows;
    assert.ok(privileges.every((row) => !row.allowed));
    const applicationPrivileges = (
      await client.query(
        "SELECT privilege,has_table_privilege('pigmie_app','public.loan_amendments',privilege) AS allowed FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege",
      )
    ).rows;
    assert.deepEqual(
      applicationPrivileges.map(({ privilege, allowed }) => [
        privilege,
        allowed,
      ]),
      [
        ['SELECT', true],
        ['INSERT', true],
        ['UPDATE', false],
        ['DELETE', false],
      ],
    );
    await client.query('DELETE FROM public.loans WHERE id=$1', [loan]);
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM public.loan_amendments WHERE loan_id=$1',
          [loan],
        )
      ).rows[0].count,
      0,
    );
    const cascadeLoan = await createLoan();
    await client.query(insert, [
      randomUUID(),
      org,
      cascadeLoan,
      staff,
      1,
      'restructure',
      before,
      after,
    ]);
    await client.query('DELETE FROM public.organizations WHERE id=$1', [org]);
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM public.loan_amendments WHERE loan_id=$1',
          [cascadeLoan],
        )
      ).rows[0].count,
      0,
    );
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
  assert.deepEqual(await baselineCatalog(client), beforeCatalog);
  assert.deepEqual(await dataEvidence(client), beforeRows);
  assert.deepEqual(
    (await client.query('SELECT * FROM public._prisma_migrations ORDER BY id'))
      .rows,
    history,
  );
  if (archived)
    assert.deepEqual(
      (
        await client.query(
          'SELECT * FROM pigmie_migration_evidence.original_history ORDER BY id',
        )
      ).rows,
      archived,
    );
  return {
    immutableAmendments: true,
    sequentialVersions: true,
    tenantAndActorScope: true,
    parentCascades: true,
    paidComponentConstraints: true,
    browserGrantsDenied: true,
    originalRowsAndHistoryUnchanged: true,
  };
}
