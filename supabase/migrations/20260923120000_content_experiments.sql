-- Phase 6: owner-scoped experiments link ideas, reviewed scripts and published videos.
-- Results remain deterministic application output; no causal claim is stored here.
begin;

create table public.content_experiments (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  content_idea_id uuid references public.content_ideas (id) on delete set null,
  script_draft_id uuid references public.script_drafts (id) on delete set null,
  video_id uuid,
  title text not null check (length(btrim(title)) between 1 and 200),
  hypothesis text not null check (length(btrim(hypothesis)) between 1 and 4000),
  hook_format text not null default '' check (length(hook_format) <= 200),
  reporting_window_days integer not null check (reporting_window_days in (1, 7, 28)),
  status text not null default 'planned' check (status in ('planned', 'running', 'completed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (video_id) references public.videos (id) on delete set null,
  check (status <> 'running' or video_id is not null),
  check (status <> 'completed' or (video_id is not null and completed_at is not null))
);
create index content_experiments_channel_status_idx
  on public.content_experiments (channel_id, status, created_at desc);
create index content_experiments_video_idx
  on public.content_experiments (video_id) where video_id is not null;
comment on table public.content_experiments is
  'Owner-scoped experiment plans and links. Evaluation compares equivalent reporting windows and labels measured observations separately from hypotheses.';

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
