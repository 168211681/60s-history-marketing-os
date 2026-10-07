-- Sprint 004.2. Local only. Do not apply this file to Staging or Production.
-- Do not rewrite earlier migrations.
begin;

create function private.classification_accepted_fields_are_bounded(fields text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select fields is not null
    and fields <@ array['topic', 'content_pillar', 'production_type']::text[]
    and coalesce((
      select pg_catalog.bool_and(field is not null)
         and pg_catalog.count(*) = pg_catalog.count(distinct field)
        from pg_catalog.unnest(fields) as field
    ), true);
$$;

revoke all on function private.classification_accepted_fields_are_bounded(text[]) from public, anon, authenticated;
grant execute on function private.classification_accepted_fields_are_bounded(text[]) to service_role;

comment on function private.classification_accepted_fields_are_bounded(text[]) is
  'Constraint helper for accepted classification fields. Not an RPC. Executes as the calling role.';

alter table public.content_items
  add column content_pillar text not null default '';

alter table public.content_items
  add constraint content_items_content_pillar_length_check
  check (length(content_pillar) <= 80);

comment on column public.content_items.content_pillar is
  'Owner-controlled content pillar. Empty until a person sets it or accepts a suggestion. Not inferred from duration or YouTube source facts.';

grant update (content_pillar) on public.content_items to authenticated;

create table public.content_classification_suggestions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null,
  owner_id uuid not null,
  suggested_topic text check (suggested_topic is null or length(suggested_topic) <= 200),
  suggested_content_pillar text check (suggested_content_pillar is null or length(suggested_content_pillar) <= 80),
  suggested_production_type text not null check (suggested_production_type in ('unknown', 'new', 'remaster', 'repurpose', 'other')),
  topic_confidence numeric check (topic_confidence is null or (topic_confidence >= 0 and topic_confidence <= 1)),
  pillar_confidence numeric check (pillar_confidence is null or (pillar_confidence >= 0 and pillar_confidence <= 1)),
  production_type_confidence numeric check (production_type_confidence is null or (production_type_confidence >= 0 and production_type_confidence <= 1)),
  topic_rationale text not null default '' check (length(topic_rationale) <= 2000),
  pillar_rationale text not null default '' check (length(pillar_rationale) <= 2000),
  production_type_rationale text not null default '' check (length(production_type_rationale) <= 2000),
  provider text not null check (length(provider) between 1 and 40),
  model text not null check (length(model) between 1 and 80),
  prompt_version text not null check (length(prompt_version) between 1 and 40),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_metadata_synced_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  accepted_fields text[] not null default '{}' check (private.classification_accepted_fields_are_bounded(accepted_fields)),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (content_item_id, prompt_version, source_fingerprint),
  foreign key (content_item_id, owner_id) references public.content_items (id, owner_id) on delete cascade
);

create index content_classification_suggestions_owner_item_idx
  on public.content_classification_suggestions (owner_id, content_item_id, created_at desc);

comment on table public.content_classification_suggestions is
  'AI metadata suggestion for one content item. Authenticated owners may read their rows. Only the server writes or reviews them. Accepting a suggestion is a separate human action.';

alter table public.content_classification_suggestions enable row level security;
alter table public.content_classification_suggestions force row level security;
revoke all on table public.content_classification_suggestions from public, anon, authenticated, service_role;
grant select on table public.content_classification_suggestions to authenticated;
grant select, insert, update, delete on table public.content_classification_suggestions to service_role;

create policy content_classification_suggestions_select_own
  on public.content_classification_suggestions
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

commit;
