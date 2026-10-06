-- ClipForge core records. A project is not a YouTube channel.
-- Do not rewrite earlier migrations. Do not apply this file to Staging or Production
-- without a separate approval; local tests are the gate for this sprint.
begin;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  code text check (code is null or code ~ '^[A-Z0-9][A-Z0-9-]{0,15}$'),
  description text not null default '' check (length(description) <= 4000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index projects_owner_code_idx on public.projects (owner_id, code) where code is not null;
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
comment on table public.projects is
  'Owner-scoped ClipForge workspace. A project does not require a YouTube channel.';

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null,
  content_key text check (content_key is null or content_key ~ '^[A-Z0-9][A-Z0-9-]{0,31}$'),
  title text not null check (length(btrim(title)) between 1 and 200),
  topic text not null default '' check (length(topic) <= 200),
  format text not null default 'short_form' check (format in ('short_form', 'long_form', 'other')),
  production_type text not null default 'new' check (production_type in ('new', 'remaster', 'repurpose', 'other')),
  status text not null default 'idea' check (status in ('idea', 'generating', 'editing', 'ready', 'scheduled', 'published', 'archived')),
  language_code text not null default 'en' check (language_code ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'),
  duration_seconds integer check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 86400)),
  notes text not null default '' check (length(notes) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);
create unique index content_items_owner_key_idx on public.content_items (owner_id, content_key) where content_key is not null;
create index content_items_project_updated_idx on public.content_items (project_id, updated_at desc);
create index content_items_owner_status_idx on public.content_items (owner_id, status);
comment on table public.content_items is
  'ClipForge content record. Ownership follows the project through the composite foreign key. No files, captions, posts, or analytics snapshots.';

do $$
declare table_name text;
begin
  foreach table_name in array array['projects', 'content_items'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
  end loop;
end $$;

grant insert (owner_id, name, code, description, status) on public.projects to authenticated;
grant update (name, code, description, status) on public.projects to authenticated;
grant delete on public.projects to authenticated;

grant insert (
  project_id, owner_id, content_key, title, topic, format, production_type,
  status, language_code, duration_seconds, notes
) on public.content_items to authenticated;
grant update (
  project_id, content_key, title, topic, format, production_type,
  status, language_code, duration_seconds, notes
) on public.content_items to authenticated;
grant delete on public.content_items to authenticated;

create policy projects_select_own on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy projects_insert_own on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy projects_update_own on public.projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy projects_delete_own on public.projects for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy content_items_select_own on public.content_items for select to authenticated
  using (owner_id = (select auth.uid()));
create policy content_items_insert_own on public.content_items for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and project_id in (select id from public.projects where owner_id = (select auth.uid()))
  );
create policy content_items_update_own on public.content_items for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and project_id in (select id from public.projects where owner_id = (select auth.uid()))
  );
create policy content_items_delete_own on public.content_items for delete to authenticated
  using (owner_id = (select auth.uid()));

commit;
