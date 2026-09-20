begin;

create table public.market_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  youtube_channel_id text not null check (length(btrim(youtube_channel_id)) between 1 and 128),
  title text not null check (length(btrim(title)) between 1 and 200),
  channel_url text not null check (length(channel_url) between 1 and 500),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, youtube_channel_id)
);
create index market_channels_owner_created_idx on public.market_channels (owner_id, created_at desc);

create table public.market_videos (
  id uuid primary key default gen_random_uuid(),
  market_channel_id uuid not null references public.market_channels (id) on delete cascade,
  youtube_video_id text not null check (length(btrim(youtube_video_id)) between 1 and 128),
  title text not null check (length(btrim(title)) between 1 and 300),
  published_at timestamptz not null,
  duration_seconds numeric check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds < 'Infinity'::numeric)),
  views bigint check (views is null or views >= 0),
  likes bigint check (likes is null or likes >= 0),
  comments bigint check (comments is null or comments >= 0),
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_channel_id, youtube_video_id)
);
create index market_videos_channel_published_idx on public.market_videos (market_channel_id, published_at desc);
create index market_videos_views_idx on public.market_videos (views desc nulls last);

alter table public.market_channels enable row level security;
alter table public.market_channels force row level security;
alter table public.market_videos enable row level security;
alter table public.market_videos force row level security;
revoke all on table public.market_channels, public.market_videos from public, anon, authenticated, service_role;
grant select on table public.market_channels, public.market_videos to authenticated;
grant select, insert, update, delete on table public.market_channels, public.market_videos to service_role;

create trigger set_updated_at before update on public.market_channels
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.market_videos
  for each row execute function private.set_updated_at();

create policy market_channels_read_own on public.market_channels for select to authenticated
  using (owner_id = (select auth.uid()));
create policy market_videos_read_own on public.market_videos for select to authenticated
  using (market_channel_id in (select id from public.market_channels where owner_id = (select auth.uid())));

comment on table public.market_channels is
  'Owner-scoped public YouTube channels tracked for market and competitor analysis. It contains no private competitor analytics.';
comment on table public.market_videos is
  'Public YouTube video snapshots collected for market analysis; NULL metrics remain unavailable rather than zero.';

commit;
