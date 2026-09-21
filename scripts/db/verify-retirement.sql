-- Read-only verification. Run as a privileged database operator on staging only.
-- Do not paste credentials or query results containing tokens into tickets/chat.
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('production_workflows', 'video_generation_jobs', 'script_drafts', 'channel_metrics')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('production_workflows', 'video_generation_jobs', 'script_drafts', 'channel_metrics')
order by c.relname;

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('production_workflows', 'video_generation_jobs', 'script_drafts', 'channel_metrics')
order by tablename, policyname;

select table_name,
       has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') as service_can_select,
       has_table_privilege('service_role', format('public.%I', table_name), 'INSERT') as service_can_insert,
       has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE') as service_can_update,
       has_table_privilege('service_role', format('public.%I', table_name), 'DELETE') as service_can_delete
from (values ('production_workflows'), ('video_generation_jobs'), ('script_drafts'), ('channel_metrics')) as tables(table_name)
order by table_name;

-- Expected after the retirement migration:
-- production_workflows/video_generation_jobs: no service_role INSERT/UPDATE/DELETE.
-- script_drafts/channel_metrics: service_role writes remain available.
-- All four tables remain RLS-enabled and forced.
