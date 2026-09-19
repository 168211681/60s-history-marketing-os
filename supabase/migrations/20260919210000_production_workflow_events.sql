begin;

create table private.production_workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.production_workflows (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  attempt integer not null check (attempt between 0 and 10),
  event_type text not null check (event_type in (
    'claimed', 'submitted', 'polled', 'poll_failed', 'rendered',
    'upload_started', 'uploaded_private', 'failed', 'retry_queued', 'published'
  )),
  status text not null check (status in (
    'queued', 'rendering', 'rendered', 'uploaded_private', 'published', 'failed', 'cancelled'
  )),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index production_workflow_events_workflow_created_idx
  on private.production_workflow_events (workflow_id, created_at desc);
create index production_workflow_events_channel_created_idx
  on private.production_workflow_events (channel_id, created_at desc);

comment on table private.production_workflow_events is
  'Backend-only, sanitized state transition telemetry. Never store tokens, provider payloads, or artifact contents.';

alter table private.production_workflow_events enable row level security;
alter table private.production_workflow_events force row level security;
revoke all on table private.production_workflow_events from public, anon, authenticated, service_role;
grant select, insert on table private.production_workflow_events to service_role;

commit;
