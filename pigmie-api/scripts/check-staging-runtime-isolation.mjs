import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  configuration,
  connection,
  exactHistory,
  verifyRole,
} from './deploy-runtime-isolation.mjs';

let operator,
  runtime,
  checkpoint = 'configuration';
const ids = [randomUUID(), randomUUID()],
  auth = randomUUID();
try {
  assert.equal(process.argv.length, 2);
  const { config, ref } = configuration('--staging');
  assert.ok(config.RUNTIME_DATABASE_URL);
  operator = connection(config.DIRECT_URL, ref);
  await operator.connect();
  await exactHistory(operator, true);
  await verifyRole(operator, true);
  checkpoint = 'synthetic fixture creation';
  await operator.query('BEGIN');
  await operator.query(
    "INSERT INTO public.organizations(id,name) VALUES($1,'Synthetic runtime boundary'),($2,'Synthetic runtime foreign boundary')",
    ids,
  );
  await operator.query(
    "INSERT INTO public.staff(id,organization_id,auth_user_id,full_name,email,role) VALUES($1,$2,$3,'Synthetic runtime','runtime-proof@example.test','org_admin')",
    [randomUUID(), ids[0], auth],
  );
  await operator.query('COMMIT');
  runtime = connection(config.RUNTIME_DATABASE_URL, ref, true);
  await runtime.connect();
  checkpoint = 'actual login and empty unscoped reads';
  assert.equal(
    (await runtime.query("SELECT current_user='pigmie_runtime' AS ok")).rows[0]
      .ok,
    true,
  );
  for (const table of [
    'organizations',
    'staff',
    'customers',
    'loans',
    'loan_schedule',
    'collections',
    'audit_logs',
    'loan_amendments',
  ])
    assert.equal(
      (await runtime.query(`SELECT count(*)::int AS n FROM public.${table}`))
        .rows[0].n,
      0,
    );
  async function denied(sql, values) {
    let code;
    try {
      await runtime.query(sql, values);
    } catch (error) {
      code = error.code;
    }
    assert.ok(['42501', '23514'].includes(code));
  }
  await denied('SELECT id FROM auth.users LIMIT 1');
  await denied('SELECT * FROM public._prisma_migrations LIMIT 1');
  await denied('SET ROLE postgres');
  await denied('CREATE TABLE public.__runtime_forbidden(id integer)');
  assert.equal(
    (
      await runtime.query(
        'SELECT count(*)::int AS n FROM public.runtime_provider_session($1,$2)',
        [auth, randomUUID()],
      )
    ).rows[0].n,
    0,
  );
  await denied('SELECT * FROM public.runtime_onboarding_identity($1)', [auth]);
  let pairedRejected = false;
  try {
    await runtime.query(
      'SELECT * FROM public.runtime_provisioning_candidates($1,NULL)',
      [auth],
    );
  } catch (error) {
    pairedRejected = error.code === '22023';
  }
  assert.equal(pairedRejected, true);
  await denied(
    "INSERT INTO public.customers(id,organization_id,full_name,phone) VALUES($1,$2,'Synthetic','test')",
    [randomUUID(), ids[1]],
  );
  checkpoint = 'tenant context and forbidden tenant switch';
  await runtime.query('BEGIN');
  await runtime.query("SELECT set_config('app.current_org_id',$1,true)", [
    ids[0],
  ]);
  assert.deepEqual(
    (await runtime.query('SELECT id FROM public.organizations')).rows,
    [{ id: ids[0] }],
  );
  assert.equal(
    (
      await runtime.query(
        'UPDATE public.organizations SET name=name WHERE id=$1',
        [ids[1]],
      )
    ).rowCount,
    0,
  );
  await runtime.query('SAVEPOINT forbidden_write');
  await denied(
    "INSERT INTO public.customers(id,organization_id,full_name,phone) VALUES($1,$2,'Synthetic','test')",
    [randomUUID(), ids[1]],
  );
  await runtime.query('ROLLBACK TO SAVEPOINT forbidden_write');
  await runtime.query('COMMIT');
  assert.equal(
    (await runtime.query('SELECT count(*)::int AS n FROM public.organizations'))
      .rows[0].n,
    0,
  );
  checkpoint = 'identity SELECT only and transaction local recovery';
  await runtime.query('BEGIN');
  await runtime.query("SELECT set_config('app.current_auth_id',$1,true)", [
    auth,
  ]);
  assert.equal(
    (
      await runtime.query(
        'SELECT count(*)::int AS n FROM public.runtime_provider_session($1,$2)',
        [auth, randomUUID()],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await runtime.query(
        'SELECT count(*)::int AS n FROM public.runtime_provider_session($1,$2)',
        [randomUUID(), randomUUID()],
      )
    ).rows[0].n,
    0,
  );
  await runtime.query('SAVEPOINT helper_bound');
  await denied('SELECT * FROM public.runtime_onboarding_identity($1)', [auth]);
  await runtime.query('ROLLBACK TO SAVEPOINT helper_bound');
  await runtime.query("SELECT set_config('app.onboarding_mode','1',true)");
  await runtime.query('SAVEPOINT helper_mismatch');
  await denied('SELECT * FROM public.runtime_onboarding_identity($1)', [
    randomUUID(),
  ]);
  await runtime.query('ROLLBACK TO SAVEPOINT helper_mismatch');
  assert.equal(
    (await runtime.query('SELECT count(*)::int AS n FROM public.staff')).rows[0]
      .n,
    1,
  );
  assert.equal(
    (
      await runtime.query(
        'UPDATE public.staff SET full_name=full_name WHERE auth_user_id=$1',
        [auth],
      )
    ).rowCount,
    0,
  );
  await runtime.query('ROLLBACK');
  assert.equal(
    (await runtime.query('SELECT count(*)::int AS n FROM public.staff')).rows[0]
      .n,
    0,
  );
  await runtime.query('BEGIN');
  assert.equal(
    (
      await runtime.query(
        "SELECT nullif(current_setting('app.current_org_id',true),'') IS NULL AND nullif(current_setting('app.current_auth_id',true),'') IS NULL AS clear",
      )
    ).rows[0].clear,
    true,
  );
  await runtime.query('ROLLBACK');
  console.log(
    JSON.stringify({
      actualRuntimeLogin: true,
      crossTenantReadsAndWritesDenied: true,
      authTablesDenied: true,
      identityReadOnly: true,
      transactionContextCleared: true,
      operatorCredentialsNotUsedByRuntime: true,
    }),
  );
} catch {
  await operator?.query('ROLLBACK').catch(() => {});
  await runtime?.query('ROLLBACK').catch(() => {});
  console.error(
    `Runtime isolation proof stopped at ${checkpoint}; secrets and provider diagnostics suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await runtime?.end().catch(() => {});
  if (operator) {
    try {
      await operator.query(
        'DELETE FROM public.organizations WHERE id=ANY($1::uuid[])',
        [ids],
      );
      assert.equal(
        (
          await operator.query(
            'SELECT count(*)::int AS n FROM public.organizations WHERE id=ANY($1::uuid[])',
            [ids],
          )
        ).rows[0].n,
        0,
      );
    } catch {
      console.error(
        'Synthetic runtime cleanup failed; reconcile marked synthetic organizations before rerunning.',
      );
      process.exitCode = 1;
    }
    await operator.end().catch(() => {});
  }
}
