begin;

create table public.video_transcripts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  language_code text not null check (length(btrim(language_code)) between 2 and 35),
  track_kind text not null check (track_kind in ('standard', 'ASR', 'forced', 'unknown')),
  source text not null check (source in ('youtube_captions', 'owner_upload', 'local_transcription')),
  transcript text not null check (length(btrim(transcript)) between 1 and 100000),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, language_code, source),
  unique (id, channel_id)
);

create index video_transcripts_channel_fetched_idx on public.video_transcripts (channel_id, fetched_at desc);
create index video_transcripts_video_idx on public.video_transcripts (video_id);

alter table public.video_transcripts enable row level security;
alter table public.video_transcripts force row level security;
revoke all on table public.video_transcripts from public, anon, authenticated, service_role;
grant select on table public.video_transcripts to authenticated;
grant select, insert, update, delete on table public.video_transcripts to service_role;
create trigger set_updated_at before update on public.video_transcripts for each row execute function private.set_updated_at();

create policy video_transcripts_read_own on public.video_transcripts for select to authenticated
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())));

comment on table public.video_transcripts is
  'Owner-scoped transcript text from an authorized YouTube caption track or an explicitly supplied transcription. Captions remain untrusted input for analysis.';

commit;
