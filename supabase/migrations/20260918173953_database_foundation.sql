-- Phase 2 foundation. Supabase owns auth.users, auth.uid() and the API roles.
-- No credentials, OAuth tokens or real analytics are inserted by this migration.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.users is
  'Minimal application identity, provisioned by a trusted backend after sign-in. No duplicated email or profile metadata.';

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  youtube_channel_id text not null unique check (length(youtube_channel_id) between 1 and 128),
  title text not null check (length(btrim(title)) between 1 and 200),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index channels_owner_id_idx on public.channels (owner_id);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  youtube_video_id text not null check (length(youtube_video_id) between 1 and 128),
  title text not null check (length(btrim(title)) between 1 and 300),
  topic text check (length(topic) <= 200),
  published_at timestamptz,
  duration_seconds numeric check (duration_seconds >= 0 and duration_seconds < 'Infinity'::numeric),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, youtube_video_id),
  unique (id, channel_id)
);
create index videos_channel_published_idx on public.videos (channel_id, published_at desc);

create table public.video_metrics (
  channel_id uuid not null references public.channels (id) on delete cascade,
  video_id uuid not null,
  metric_date date not null,
  views bigint check (views >= 0),
  estimated_minutes_watched numeric check (estimated_minutes_watched >= 0 and estimated_minutes_watched < 'Infinity'::numeric),
  average_view_duration_seconds numeric check (average_view_duration_seconds >= 0 and average_view_duration_seconds < 'Infinity'::numeric),
  subscribers_gained bigint check (subscribers_gained >= 0),
  subscribers_lost bigint check (subscribers_lost >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (video_id, metric_date),
  foreign key (video_id, channel_id) references public.videos (id, channel_id) on delete cascade
);
create index video_metrics_channel_date_idx on public.video_metrics (channel_id, metric_date desc);
comment on table public.video_metrics is
  'One row per video per API reporting date. NULL means unavailable, not zero. Upsert by video_id, metric_date; metric_date preserves the API date semantics.';

create table public.channel_metrics (
  channel_id uuid not null references public.channels (id) on delete cascade,
  metric_date date not null,
  views bigint check (views >= 0),
  estimated_minutes_watched numeric check (estimated_minutes_watched >= 0 and estimated_minutes_watched < 'Infinity'::numeric),
  average_view_duration_seconds numeric check (average_view_duration_seconds >= 0 and average_view_duration_seconds < 'Infinity'::numeric),
  subscribers_gained bigint check (subscribers_gained >= 0),
  subscribers_lost bigint check (subscribers_lost >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (channel_id, metric_date)
);
comment on table public.channel_metrics is
  'One row per channel per API reporting date; missing metrics remain NULL. Channel totals are not assumed to equal the stored subset of videos.';

create table private.analytics_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_code text check (error_code ~ '^[A-Z0-9_]{1,64}$'),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, idempotency_key),
  check (finished_at is null or (started_at is not null and finished_at >= started_at))
);
comment on table private.analytics_sync_jobs is
  'Backend only. Store sanitized error codes, never raw provider responses, tokens or secrets. Unique channel/key supports idempotent job creation; a worker is not implemented.';

create table public.marketing_insights (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  kind text not null check (kind in ('observation', 'comparison', 'hypothesis', 'experiment')),
  origin text not null check (origin in ('calculated', 'human', 'ai')),
  content text not null check (length(btrim(content)) between 1 and 10000),
  evidence_summary text not null check (length(btrim(evidence_summary)) between 1 and 10000),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  model_identifier text check (length(model_identifier) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (origin <> 'ai' or (kind in ('hypothesis', 'experiment') and model_identifier is not null)),
  check (origin = 'ai' or model_identifier is null)
);
create index marketing_insights_channel_created_idx on public.marketing_insights (channel_id, created_at desc);
comment on table public.marketing_insights is
  'Untrusted plain text with explicit evidence and provenance. AI output cannot be labeled an observation or calculated comparison.';

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  angle text not null default '' check (length(angle) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'shortlisted', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_ideas_channel_created_idx on public.content_ideas (channel_id, created_at desc);

-- Trigger only: no SECURITY DEFINER and no RPC surface in public.
create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users', 'channels', 'videos', 'video_metrics', 'channel_metrics',
    'marketing_insights', 'content_ideas'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    -- Reset legacy Supabase default grants before granting least privilege.
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
  end loop;
end;
$$;

alter table private.analytics_sync_jobs enable row level security;
alter table private.analytics_sync_jobs force row level security;
revoke all on table private.analytics_sync_jobs from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.analytics_sync_jobs to service_role;
create trigger set_updated_at before update on private.analytics_sync_jobs
  for each row execute function private.set_updated_at();

create policy users_read_own on public.users for select to authenticated
  using (id = (select auth.uid()));
create policy channels_read_own on public.channels for select to authenticated
  using (owner_id = (select auth.uid()));

do $$
declare table_name text;
begin
  foreach table_name in array array['videos', 'video_metrics', 'channel_metrics', 'marketing_insights', 'content_ideas'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (channel_id in (select id from public.channels where owner_id = (select auth.uid())))',
      table_name || '_read_own', table_name
    );
  end loop;
end;
$$;

-- Clients can manage ideas, but cannot rewrite their channel, identity or timestamps.
grant insert (channel_id, title, angle, status) on public.content_ideas to authenticated;
grant update (title, angle, status) on public.content_ideas to authenticated;
grant delete on public.content_ideas to authenticated;
create policy content_ideas_insert_own on public.content_ideas for insert to authenticated
  with check (channel_id in (select id from public.channels where owner_id = (select auth.uid())));
create policy content_ideas_update_own on public.content_ideas for update to authenticated
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())))
  with check (channel_id in (select id from public.channels where owner_id = (select auth.uid())));
create policy content_ideas_delete_own on public.content_ideas for delete to authenticated
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())));

commit;
