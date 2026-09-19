begin;

create table public.production_workflows (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  script_draft_id uuid not null references public.script_drafts (id) on delete cascade,
  workflow_type text not null default 'shorts' check (workflow_type in ('shorts')),
  status text not null default 'queued' check (status in ('queued', 'rendering', 'rendered', 'uploaded_private', 'published', 'failed', 'cancelled')),
  current_step text not null default 'awaiting_render' check (current_step in ('awaiting_render', 'rendering', 'awaiting_upload', 'uploading_private', 'awaiting_publish', 'published', 'failed', 'cancelled')),
  artifact_url text check (artifact_url is null or length(btrim(artifact_url)) between 1 and 2000),
  youtube_video_id text check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_draft_id, workflow_type)
);

create index production_workflows_channel_created_idx on public.production_workflows (channel_id, created_at desc);
create index production_workflows_status_idx on public.production_workflows (status, created_at) where status in ('queued', 'rendering', 'rendered', 'uploaded_private');

comment on table public.production_workflows is 'Owner-scoped production state machine. Public publishing remains a separate human-approved action.';

alter table public.production_workflows enable row level security;
alter table public.production_workflows force row level security;
revoke all on table public.production_workflows from public, anon, authenticated, service_role;
grant select on table public.production_workflows to authenticated;
grant select, insert, update, delete on table public.production_workflows to service_role;
create trigger set_updated_at before update on public.production_workflows
  for each row execute function private.set_updated_at();
create policy production_workflows_read_own on public.production_workflows
  for select to authenticated
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())));

commit;
