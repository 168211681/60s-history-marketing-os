-- Reconcile the legacy Production table with the Phase 6 application contract.
-- This migration is forward-only: it never drops or recreates the table, and it
-- leaves legacy observed_* fields and rows available for audit/history.
begin;

alter table public.content_experiments
  add column if not exists title text;

alter table public.content_experiments
  add column if not exists reporting_window_days integer;

-- Legacy Production rows have topic but no title. Backfill only from that
-- existing value; a missing topic remains NULL so the application can report
-- insufficient evidence instead of inventing metadata.
do $migration$
declare
  updated_at_trigger_enabled boolean;
begin
  select exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.content_experiments'::regclass
       and tgname = 'set_updated_at'
       and not tgisinternal
       and tgenabled <> 'D'
  ) into updated_at_trigger_enabled;

  if updated_at_trigger_enabled then
    alter table public.content_experiments disable trigger "set_updated_at";
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'content_experiments'
       and column_name = 'topic'
  ) then
    execute $sql$
      update public.content_experiments
         set title = nullif(btrim(topic), '')
       where title is null
         and topic is not null
    $sql$;
  end if;

  if updated_at_trigger_enabled then
    alter table public.content_experiments enable trigger "set_updated_at";
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.content_experiments'::regclass
       and conname = 'content_experiments_title_compatibility_check'
  ) then
    alter table public.content_experiments
      add constraint content_experiments_title_compatibility_check
      check (title is null or length(btrim(title)) between 1 and 200)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.content_experiments'::regclass
       and conname = 'content_experiments_reporting_window_compatibility_check'
  ) then
    alter table public.content_experiments
      add constraint content_experiments_reporting_window_compatibility_check
      check (reporting_window_days is null or reporting_window_days in (1, 7, 28))
      not valid;
  end if;
end
$migration$;

-- Preserve an existing video relationship and add it only when the legacy
-- table has no equivalent foreign key. NOT VALID protects future writes while
-- allowing historical rows to be reviewed separately.
do $migration$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'content_experiments'
       and column_name = 'video_id'
  ) and not exists (
    select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any(c.conkey)
     where c.conrelid = 'public.content_experiments'::regclass
       and c.confrelid = 'public.videos'::regclass
       and c.contype = 'f'
       and a.attname = 'video_id'
  ) then
    alter table public.content_experiments
      add constraint content_experiments_video_id_compatibility_fkey
      foreign key (video_id) references public.videos (id) on delete set null
      not valid;
  end if;
end
$migration$;

create index if not exists content_experiments_channel_status_idx
  on public.content_experiments (channel_id, status, created_at desc);
create index if not exists content_experiments_video_idx
  on public.content_experiments (video_id) where video_id is not null;

comment on column public.content_experiments.title is
  'Phase 6 title; legacy rows may be NULL when no safe source value existed.';
comment on column public.content_experiments.reporting_window_days is
  'Comparable evidence window in days; legacy rows remain NULL when no defensible value exists.';

commit;
