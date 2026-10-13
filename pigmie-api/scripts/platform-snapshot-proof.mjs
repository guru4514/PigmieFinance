import { createHash } from 'node:crypto';
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
export async function platformSnapshotProof(client) {
  const tables = (
    await client.query(
      'SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1) ORDER BY schemaname,tablename',
      [['public', 'auth', 'storage', 'pigmie_migration_evidence']],
    )
  ).rows;
  const evidence = [];
  for (const { schemaname, tablename } of tables) {
    const result = (
      await client.query(
        `SELECT count(*)::text AS count, md5(COALESCE(string_agg(row_hash, '' ORDER BY row_hash), '')) AS digest FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM ${quote(schemaname)}.${quote(tablename)} t) rows`,
      )
    ).rows[0];
    evidence.push({ schema: schemaname, table: tablename, ...result });
  }
  const schemas = ['public', 'auth', 'storage', 'pigmie_migration_evidence'];
  const catalogQueries = [
    "SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,p.conname,pg_get_constraintdef(p.oid) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_constraint p ON p.conrelid=c.oid WHERE n.nspname=ANY($1) AND c.relkind='r' ORDER BY n.nspname,c.relname,p.conname",
    'SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=ANY($1) ORDER BY schemaname,tablename,indexname',
    'SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=ANY($1) ORDER BY schemaname,tablename,policyname',
    "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1) AND p.prokind='f' ORDER BY n.nspname,p.proname,arguments",
    'SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND NOT t.tgisinternal ORDER BY n.nspname,c.relname,t.tgname',
    'SELECT table_schema,table_name,column_name,udt_name,is_nullable,character_maximum_length,numeric_precision,numeric_scale,datetime_precision,column_default FROM information_schema.columns WHERE table_schema=ANY($1) ORDER BY table_schema,table_name,ordinal_position',
  ];
  const catalog = [];
  for (const query of catalogQueries)
    catalog.push((await client.query(query, [schemas])).rows);
  return {
    tableCount: tables.length,
    dataDigest: createHash('sha256')
      .update(JSON.stringify(evidence))
      .digest('hex'),
    catalogDigest: createHash('sha256')
      .update(JSON.stringify(catalog))
      .digest('hex'),
  };
}
