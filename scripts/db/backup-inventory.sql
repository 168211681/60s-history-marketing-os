-- Read-only catalog inventory. Row counts are collected in the same exported
-- snapshot as pg_dump. This file never repairs or compares migration versions.
select coalesce(jsonb_agg(item order by item->>'schema', item->>'name'), '[]'::jsonb)
from (
  select jsonb_build_object(
    'schema', n.nspname, 'name', c.relname,
    'rls', c.relrowsecurity, 'forced_rls', c.relforcerowsecurity,
    'columns', (select coalesce(jsonb_agg(jsonb_build_array(a.attname,
      format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
      pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]'::jsonb)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select coalesce(jsonb_agg(jsonb_build_array(conname,
      pg_get_constraintdef(oid),convalidated) order by conname),'[]'::jsonb)
      from pg_constraint where conrelid=c.oid),
    'indexes', (select coalesce(jsonb_agg(jsonb_build_array(ci.relname,
      pg_get_indexdef(i.indexrelid),i.indisvalid) order by ci.relname),'[]'::jsonb)
      from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid),
    'policies', (select coalesce(jsonb_agg(jsonb_build_array(policyname,
      permissive,roles,cmd,qual,with_check) order by policyname),'[]'::jsonb)
      from pg_policies where schemaname=n.nspname and tablename=c.relname),
    'triggers', (select coalesce(jsonb_agg(pg_get_triggerdef(oid) order by tgname),'[]'::jsonb)
      from pg_trigger where tgrelid=c.oid and not tgisinternal)
  ) item
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','supabase_migrations') and c.relkind in ('r','p')
    and not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass
      and d.objid=c.oid and d.deptype='e')
) tables;
