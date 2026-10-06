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
-- Minimal test-only Supabase Storage contract used by archived artifact
-- migrations and the ClipForge asset migration. The real `storage` schema is
-- supplied by Supabase. This fake catalog is TEST-ONLY and must never be
-- applied to a hosted project. storage.foldername matches the hosted helper:
-- every path segment except the object filename.
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);
create function storage.foldername(name text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when name is null or position('/' in name) = 0 then '{}'::text[]
    else (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1]
  end
$$;
alter table storage.objects enable row level security;
-- Exercise the older, permissive Supabase defaults: the migration must remove them.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
