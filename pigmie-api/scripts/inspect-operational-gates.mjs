import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';

// Catalog-only reads. Never log a connection, environment value, role setting,
// policy expression, provider response or application/Auth row.
const recoveryNames = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'BACKUP_ENCRYPTION_KEY',
  'BACKUP_OBJECT_KEY',
];
let phase = 'configuration';
const tablesSql = `WITH tables AS (
  SELECT c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations'
) SELECT count(*)::int AS tables,
  count(*) FILTER (WHERE NOT relrowsecurity)::int AS without_rls,
  count(*) FILTER (WHERE relrowsecurity AND NOT relforcerowsecurity)::int AS rls_not_forced,
  count(*) FILTER (WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))::int AS owned_by_current_role,
  count(*) FILTER (WHERE has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'))::int AS anon_any_table_grants,
  count(*) FILTER (WHERE has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'))::int AS authenticated_any_table_grants,
  count(*) FILTER (WHERE has_table_privilege(current_user,oid,'TRUNCATE'))::int AS current_role_truncate,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=t.oid))::int AS tables_without_policies
  FROM tables t`;

async function inspect(config, ref, runtime = false) {
  if (runtime && !config.RUNTIME_DATABASE_URL)
    return {
      configured: false,
      verified: false,
      reason: 'Restricted runtime configuration is missing',
    };
  const url = new URL(
    runtime ? config.RUNTIME_DATABASE_URL : config.DIRECT_URL,
  );
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  const username = decodeURIComponent(url.username);
  const expectedRole = runtime ? 'pigmie_runtime' : 'postgres';
  assert.ok(
    (url.hostname === `db.${ref}.supabase.co` && username === expectedRole) ||
      (url.hostname.endsWith('.pooler.supabase.com') &&
        username === `${expectedRole}.${ref}` &&
        (runtime ? ['5432', '6543'].includes(url.port) : url.port === '5432')),
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
  const client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL('../prisma/supabase-ca.crt', import.meta.url),
        'utf8',
      ),
    },
  });
  try {
    phase = 'connect';
    await client.connect();
    phase = 'runtime-role-catalog';
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const role = (
      await client.query(`SELECT
      current_user='postgres' AS operator_login,
      current_user='pigmie_runtime' AS runtime_login,
      current_user='pigmie_app' AS app_login,
      r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,
      r.rolcreaterole AS create_role,r.rolcreatedb AS create_database,
      r.rolinherit AS inherits_privileges,
      (SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships,
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname='pigmie_app') AS app_role_exists,
      pg_has_role(current_user,'pigmie_app','MEMBER') AS member_of_app_role,
      current_setting('transaction_read_only')='on' AS read_only,
      nullif(current_setting('app.current_org_id',true),'') IS NOT NULL AS inherited_organization_context
      FROM pg_roles r WHERE r.rolname=current_user`)
    ).rows[0];
    const runtimeTables = (await client.query(tablesSql)).rows[0];
    let boundaryProof;
    if (runtime) {
      assert.ok(
        role.runtime_login &&
          !role.operator_login &&
          !role.superuser &&
          !role.bypass_rls &&
          !role.create_role &&
          !role.create_database &&
          !role.inherits_privileges &&
          role.memberships === 0,
      );
      assert.equal(runtimeTables.owned_by_current_role, 0);
      assert.equal(runtimeTables.without_rls, 0);
      assert.equal(runtimeTables.current_role_truncate, 0);
      assert.equal(role.inherited_organization_context, false);
      for (const table of [
        'organizations',
        'branches',
        'staff',
        'customers',
        'loan_products',
        'loans',
        'loan_schedule',
        'collections',
        'cash_deposits',
        'documents',
        'notifications',
        'audit_logs',
        'push_subscriptions',
        'approval_requests',
        'loan_amendments',
      ])
        assert.equal(
          (await client.query(`SELECT count(*)::int AS n FROM public.${table}`))
            .rows[0].n,
          0,
        );
      for (const sql of [
        'SELECT id FROM auth.users LIMIT 1',
        'SELECT * FROM public._prisma_migrations LIMIT 1',
      ]) {
        await client.query('SAVEPOINT denied_read');
        let denied = false;
        try {
          await client.query(sql);
        } catch (error) {
          denied = error.code === '42501';
        }
        await client.query('ROLLBACK TO SAVEPOINT denied_read');
        assert.equal(denied, true);
      }
      boundaryProof = {
        all15UnscopedTablesEmpty: true,
        directAuthAndMigrationReadsDenied: true,
      };
    }
    const browserPrivileges = (
      await client.query(`WITH tables AS (
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations'
    ) SELECT roles.role,
      has_schema_privilege(roles.role,'public','USAGE') AS public_schema_usage,
      count(*) FILTER (WHERE has_table_privilege(roles.role,t.oid,'SELECT'))::int AS select_tables,
      count(*) FILTER (WHERE has_table_privilege(roles.role,t.oid,'INSERT'))::int AS insert_tables,
      count(*) FILTER (WHERE has_table_privilege(roles.role,t.oid,'UPDATE'))::int AS update_tables,
      count(*) FILTER (WHERE has_table_privilege(roles.role,t.oid,'DELETE'))::int AS delete_tables,
      count(*) FILTER (WHERE has_table_privilege(roles.role,t.oid,'TRUNCATE'))::int AS truncate_tables,
      count(*) FILTER (WHERE has_table_privilege(roles.role,t.oid,'REFERENCES'))::int AS references_tables,
      count(*) FILTER (WHERE has_table_privilege(roles.role,t.oid,'TRIGGER'))::int AS trigger_tables,
      count(*) FILTER (WHERE has_table_privilege(roles.role,t.oid,'MAINTAIN'))::int AS maintain_tables
      FROM tables t CROSS JOIN (VALUES ('anon'),('authenticated')) AS roles(role)
      GROUP BY roles.role ORDER BY roles.role`)
    ).rows;
    phase = 'effective-privilege-catalog';
    const catalogs = (
      await client.query(`SELECT
      (SELECT count(*)::int FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE a.grantee=0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))) AS browser_default_acl_entries,
      (SELECT count(*)::int FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclobjtype='r' AND (d.defaclnamespace=0 OR d.defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) AND
        (a.grantee=0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))) AS browser_public_default_table_acl_entries,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prosecdef AND
          (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) AS browser_callable_public_security_definers,
      (SELECT count(*)::int FROM pg_namespace n WHERE n.nspname IN ('public','auth','storage','pigmie_migration_evidence') AND
        (has_schema_privilege('anon',n.oid,'CREATE') OR has_schema_privilege('authenticated',n.oid,'CREATE'))) AS browser_creatable_relevant_schemas,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='pigmie_migration_evidence' AND c.relkind IN ('r','p') AND
          (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))) AS browser_accessible_migration_evidence_tables,
      nullif(current_setting('pgrst.db_schemas',true),'') IS NOT NULL AS exposed_schema_setting_visible`)
    ).rows[0];
    let appRole;
    if (role.member_of_app_role) {
      phase = 'read-only-app-role-probe';
      await client.query('SAVEPOINT role_probe');
      let roleSwitchAllowed = false;
      try {
        await client.query('SET LOCAL ROLE pigmie_app');
        roleSwitchAllowed = true;
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT role_probe');
      }
      appRole = { roleSwitchAllowed };
      if (roleSwitchAllowed) {
        phase = 'app-role-catalog';
        const appCapabilities = (
          await client.query(
            `SELECT rolcanlogin AS login_enabled,rolsuper AS superuser,rolbypassrls AS bypass_rls FROM pg_roles WHERE rolname=current_user`,
          )
        ).rows[0];
        phase = 'app-table-grants';
        const appTables = (await client.query(tablesSql)).rows[0];
        phase = 'app-policy-catalog';
        appRole = {
          roleSwitchAllowed,
          ...appCapabilities,
          tables: appTables,
          appTablesWithoutPolicies: (
            await client.query(`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity AND
          c.relname<>'_prisma_migrations' AND has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE') AND
          NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND (0=ANY(p.polroles) OR
          EXISTS(SELECT 1 FROM pg_roles pr WHERE pr.oid=ANY(p.polroles) AND pg_has_role(current_user,pr.oid,'MEMBER'))))`)
          ).rows[0].count,
        };
      }
    }
    const appCatalog = (
      await client.query(`SELECT r.rolcanlogin AS login_enabled,r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' AND c.relrowsecurity
       AND has_table_privilege('pigmie_app',c.oid,'SELECT,INSERT,UPDATE,DELETE')
       AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND
        (0=ANY(p.polroles) OR EXISTS(SELECT 1 FROM pg_roles pr WHERE pr.oid=ANY(p.polroles) AND pg_has_role('pigmie_app',pr.oid,'MEMBER'))))) AS granted_tables_without_app_policies
      FROM pg_roles r WHERE r.rolname='pigmie_app'`)
    ).rows[0];
    const defaultTablePrivileges = (
      await client.query(`SELECT
      owner.rolname AS creating_role,
      CASE WHEN d.defaclnamespace=0 THEN 'global' ELSE 'public' END AS scope,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname END AS receiving_role,
      array_agg(a.privilege_type ORDER BY a.privilege_type) AS privileges
      FROM pg_default_acl d JOIN pg_roles owner ON owner.oid=d.defaclrole
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee
      WHERE d.defaclobjtype='r' AND (d.defaclnamespace=0 OR d.defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) AND
        (a.grantee=0 OR grantee.rolname IN ('anon','authenticated'))
      GROUP BY owner.rolname,d.defaclnamespace,a.grantee,grantee.rolname ORDER BY creating_role,scope,receiving_role`)
    ).rows;
    const browserCallableDefiners = (
      await client.query(`SELECT p.proname AS function_name,
      p.prorettype='event_trigger'::regtype AS event_trigger_only,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef AND
        (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
      ORDER BY p.proname`)
    ).rows;
    const appTablesWithoutPolicies = (
      await client.query(`SELECT c.relname AS table_name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relkind IN ('r','p') AND c.relrowsecurity AND c.relname<>'_prisma_migrations'
      AND has_table_privilege('pigmie_app',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND
        (0=ANY(p.polroles) OR EXISTS(SELECT 1 FROM pg_roles pr WHERE pr.oid=ANY(p.polroles) AND pg_has_role('pigmie_app',pr.oid,'MEMBER'))))
      ORDER BY c.relname`)
    ).rows;
    await client.query('ROLLBACK');
    return {
      configured: true,
      connectionPurpose: runtime
        ? 'application runtime'
        : 'maintenance operator',
      runtimeRestrictionsVerified: runtime,
      boundaryProof,
      connectedRole: role,
      connectedTables: runtimeTables,
      browserPrivileges,
      catalogs,
      defaultTablePrivileges,
      browserCallableDefiners,
      appRole,
      appCatalog,
      appTablesWithoutPolicies,
      readOnly: true,
    };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}

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
    const maintenanceAccess = await inspect(config, ref);
    const runtimeAccess = await inspect(config, ref, true);
    console.log(
      JSON.stringify({
        environment,
        maintenanceAccess,
        runtimeAccess,
        localRecoveryPresence: Object.fromEntries(
          recoveryNames.map((name) => [
            name,
            Boolean(config[name] || process.env[name]),
          ]),
        ),
        limits: [
          'Catalog privileges do not prove HTTP Data API exposure or safe RPC bodies.',
          'Runtime evidence uses the actual RUNTIME_DATABASE_URL login; maintenance evidence uses DIRECT_URL and is not application privilege evidence.',
          'Local configuration absence does not inspect deployment secret stores or independent key escrow.',
        ],
      }),
    );
  }
} catch {
  console.error(
    `Operational inspection stopped at ${phase}; credentials, records and provider diagnostics suppressed.`,
  );
  process.exitCode = 1;
}
