begin;

create table public.video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  script_draft_id uuid not null references public.script_drafts (id) on delete cascade,
  provider text not null check (provider in ('higgsfield')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  external_job_id text check (external_job_id is null or length(btrim(external_job_id)) between 1 and 300),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_draft_id, provider)
);

create index video_generation_jobs_channel_created_idx on public.video_generation_jobs (channel_id, created_at desc);
create index video_generation_jobs_status_idx on public.video_generation_jobs (status, created_at) where status in ('queued', 'running');
comment on table public.video_generation_jobs is 'Provider jobs created only from human-approved script drafts. Publishing is outside this table and always requires a separate human action.';
alter table public.video_generation_jobs enable row level security;
alter table public.video_generation_jobs force row level security;
revoke all on table public.video_generation_jobs from public, anon, authenticated, service_role;
grant select on table public.video_generation_jobs to authenticated;
grant select, insert, update, delete on table public.video_generation_jobs to service_role;
create trigger set_updated_at before update on public.video_generation_jobs for each row execute function private.set_updated_at();
create policy video_generation_jobs_read_own on public.video_generation_jobs for select to authenticated using (channel_id in (select id from public.channels where owner_id = (select auth.uid())));

commit;
