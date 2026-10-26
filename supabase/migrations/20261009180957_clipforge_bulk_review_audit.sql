begin;

-- A server-only role that cannot bypass RLS. Never grant it to authenticated,
-- anon, or authenticator. The configured server connection must be able to SET
-- ROLE; failure to do so fails closed. No existing role/policy is weakened.
create role clipforge_bulk_reviewer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant clipforge_bulk_reviewer to postgres, service_role;
grant usage on schema public, private, auth to clipforge_bulk_reviewer;
grant execute on function auth.uid() to clipforge_bulk_reviewer;
grant execute on function private.classification_accepted_fields_are_bounded(text[]) to clipforge_bulk_reviewer;

grant select on public.content_items, public.projects, public.platform_posts,
  public.channels, public.videos, public.content_classification_suggestions to clipforge_bulk_reviewer;
grant update (topic, content_pillar, production_type) on public.content_items to clipforge_bulk_reviewer;
grant update (status, accepted_fields, reviewed_at) on public.content_classification_suggestions to clipforge_bulk_reviewer;
-- PostgreSQL row locks require an UPDATE column privilege even for FOR SHARE.
-- A lock-visible UPDATE policy is also required. WITH CHECK (false) below
-- rejects every actual source write while allowing the existing FOR SHARE locks.
grant update (id) on public.projects, public.platform_posts, public.channels, public.videos to clipforge_bulk_reviewer;

do $$
declare relation text;
begin
  foreach relation in array array['content_items','projects','platform_posts','channels','content_classification_suggestions'] loop
    execute format('create policy bulk_review_select_own on public.%I for select to clipforge_bulk_reviewer using (owner_id = (select auth.uid()))', relation);
  end loop;
end $$;
create policy bulk_review_select_own on public.videos for select to clipforge_bulk_reviewer
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())));
do $$
declare relation text;
begin
  foreach relation in array array['projects','platform_posts','channels'] loop
    execute format('create policy bulk_review_lock_own on public.%I for update to clipforge_bulk_reviewer using (owner_id = (select auth.uid())) with check (false)', relation);
  end loop;
end $$;
create policy bulk_review_lock_own on public.videos for update to clipforge_bulk_reviewer
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())))
  with check (false);
create policy bulk_review_update_own on public.content_items for update to clipforge_bulk_reviewer
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy bulk_review_update_own on public.content_classification_suggestions for update to clipforge_bulk_reviewer
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create table public.content_bulk_review_batches (
  owner_id uuid not null,
  request_id uuid not null,
  action text not null check (action in ('accept', 'reject')),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 10),
  outcome text not null default 'completed' check (outcome = 'completed'),
  completed_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, request_id)
);
comment on table public.content_bulk_review_batches is
  'Append-only server audit and retry receipt. Items contain content/suggestion UUIDs, accepted fields and preview revision. Success is visible only when the entire review commits. No cascading foreign keys: history survives clip deletion.';
alter table public.content_bulk_review_batches enable row level security;
alter table public.content_bulk_review_batches force row level security;
revoke all on public.content_bulk_review_batches from public, anon, authenticated, service_role;
grant select on public.content_bulk_review_batches to authenticated;
grant select, insert on public.content_bulk_review_batches to clipforge_bulk_reviewer;
create policy bulk_review_audit_select_own on public.content_bulk_review_batches for select to authenticated, clipforge_bulk_reviewer
  using (owner_id = (select auth.uid()));
create policy bulk_review_audit_insert_own on public.content_bulk_review_batches for insert to clipforge_bulk_reviewer
  with check (owner_id = (select auth.uid()));

commit;
