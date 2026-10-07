-- Sprint 004.1. Store YouTube source facts on public.videos.
-- Do not rewrite earlier migrations. Do not apply this file to Staging or Production from this branch.
begin;

create function private.youtube_tags_are_source_bounded(tags text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select tags is not null
    and pg_catalog.cardinality(tags) <= 30
    and coalesce((
      select pg_catalog.bool_and(tag is not null and pg_catalog.length(tag) between 1 and 100)
        from pg_catalog.unnest(tags) as tag
    ), true);
$$;

revoke all on function private.youtube_tags_are_source_bounded(text[]) from public, anon, authenticated;
grant execute on function private.youtube_tags_are_source_bounded(text[]) to service_role;

comment on function private.youtube_tags_are_source_bounded(text[]) is
  'Constraint helper for source YouTube tags. Not an RPC. Executes as the calling role.';

alter table public.videos
  add column description text not null default '',
  add column thumbnail_url text,
  add column tags text[] not null default '{}',
  add column category_id text,
  add column default_language text,
  add column default_audio_language text,
  add column privacy_status text,
  add column metadata_synced_at timestamptz;

alter table public.videos
  add constraint videos_description_length_check
  check (length(description) <= 5000);

alter table public.videos
  add constraint videos_thumbnail_url_check
  check (
    thumbnail_url is null
    or (
      length(thumbnail_url) between 1 and 2000
      and thumbnail_url ~ '^https://[^[:space:]]+$'
    )
  );

alter table public.videos
  add constraint videos_tags_check
  check (private.youtube_tags_are_source_bounded(tags));

alter table public.videos
  add constraint videos_category_id_check
  check (category_id is null or category_id ~ '^[0-9]{1,8}$');

alter table public.videos
  add constraint videos_default_language_check
  check (
    default_language is null
    or (
      length(default_language) <= 64
      and default_language ~ '^[A-Za-z0-9]{1,8}(-[A-Za-z0-9]{1,8})*$'
    )
  );

alter table public.videos
  add constraint videos_default_audio_language_check
  check (
    default_audio_language is null
    or (
      length(default_audio_language) <= 64
      and default_audio_language ~ '^[A-Za-z0-9]{1,8}(-[A-Za-z0-9]{1,8})*$'
    )
  );

alter table public.videos
  add constraint videos_privacy_status_check
  check (privacy_status is null or privacy_status in ('public', 'unlisted', 'private'));

comment on column public.videos.description is
  'YouTube snippet description, preserved as text. Empty string means the source had no description.';
comment on column public.videos.thumbnail_url is
  'One HTTPS YouTube thumbnail URL. Not an R2 asset.';
comment on column public.videos.tags is
  'Source YouTube tags. Not hashtags and not a topic.';
comment on column public.videos.category_id is
  'YouTube category id only. No category name is stored.';
comment on column public.videos.default_language is
  'Raw YouTube snippet.defaultLanguage, including multi-subtag tags. Not rewritten to the content_items language format.';
comment on column public.videos.default_audio_language is
  'Raw YouTube snippet.defaultAudioLanguage, including multi-subtag tags. Not rewritten to the content_items language format.';
comment on column public.videos.privacy_status is
  'YouTube status.privacyStatus: public, unlisted, or private.';
comment on column public.videos.metadata_synced_at is
  'Server time of the last successful source-metadata write. Clients do not supply it.';

commit;
