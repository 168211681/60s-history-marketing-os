-- Test-only Supabase auth contract. NEVER run this on a Supabase project.
-- The runner creates a disposable PostgreSQL cluster without a TCP listener.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid
language sql stable security invoker
set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Minimal test-only Supabase Storage contract used by the private artifact
-- migration. The real `storage` schema is supplied by Supabase.
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
-- Exercise the older, permissive Supabase defaults: the migration must remove them.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
