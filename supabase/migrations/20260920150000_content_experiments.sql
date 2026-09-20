begin;

alter table public.content_ideas
  add constraint content_ideas_id_channel_unique unique (id, channel_id);
alter table public.script_drafts
  add constraint script_drafts_id_channel_unique unique (id, channel_id);

create table public.content_experiments (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  content_idea_id uuid,
  script_draft_id uuid,
  video_id uuid,
  topic text not null check (length(btrim(topic)) between 1 and 300),
  hook_format text not null check (length(btrim(hook_format)) between 1 and 200),
  hypothesis text not null check (length(btrim(hypothesis)) between 1 and 5000),
  status text not null default 'planned' check (status in ('planned', 'running', 'completed', 'cancelled')),
  result_summary text not null default '' check (length(result_summary) <= 10000),
  recommendation text not null default '' check (length(recommendation) <= 5000),
  observed_views bigint check (observed_views is null or observed_views >= 0),
  observed_minutes_watched numeric check (observed_minutes_watched is null or (observed_minutes_watched >= 0 and observed_minutes_watched < 'Infinity'::numeric)),
  observed_average_view_duration_seconds numeric check (observed_average_view_duration_seconds is null or (observed_average_view_duration_seconds >= 0 and observed_average_view_duration_seconds < 'Infinity'::numeric)),
  observed_likes bigint check (observed_likes is null or observed_likes >= 0),
  observed_comments bigint check (observed_comments is null or observed_comments >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (content_idea_id) references public.content_ideas (id) on delete set null,
  foreign key (script_draft_id) references public.script_drafts (id) on delete set null,
  foreign key (video_id) references public.videos (id) on delete set null,
  check (completed_at is null or started_at is not null),
  check (status <> 'completed' or completed_at is not null)
);

create index content_experiments_channel_created_idx on public.content_experiments (channel_id, created_at desc);
create index content_experiments_channel_status_idx on public.content_experiments (channel_id, status, created_at desc);
comment on table public.content_experiments is
  'Owner-scoped experiment memory linking a content hypothesis to an approved workflow result. Metrics remain nullable when YouTube does not report them.';

alter table public.content_experiments enable row level security;
alter table public.content_experiments force row level security;
revoke all on table public.content_experiments from public, anon, authenticated, service_role;
grant select on table public.content_experiments to authenticated;
grant select, insert, update, delete on table public.content_experiments to service_role;
create trigger set_updated_at before update on public.content_experiments
  for each row execute function private.set_updated_at();

create policy content_experiments_read_own on public.content_experiments for select to authenticated
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())));

commit;
