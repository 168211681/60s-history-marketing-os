-- Sprint 004. Legacy YouTube rows can be imported without inventing a
-- publication time, a production classification, or a language. Do not rewrite
-- earlier migrations. Do not apply this file to Staging or Production from this branch.
begin;

do $$
declare
  published_constraint text;
  format_constraint text;
  production_constraint text;
  language_constraint text;
begin
  select con.conname into published_constraint
    from pg_constraint con
   where con.conrelid = 'public.platform_posts'::regclass
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%published_at%';
  if published_constraint is null then
    raise exception 'published timestamp constraint was not found';
  end if;
  execute format('alter table public.platform_posts drop constraint %I', published_constraint);

  select con.conname into format_constraint
    from pg_constraint con
   where con.conrelid = 'public.content_items'::regclass
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%short_form%';
  if format_constraint is null then
    raise exception 'content format constraint was not found';
  end if;
  execute format('alter table public.content_items drop constraint %I', format_constraint);

  select con.conname into production_constraint
    from pg_constraint con
   where con.conrelid = 'public.content_items'::regclass
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%remaster%';
  if production_constraint is null then
    raise exception 'production type constraint was not found';
  end if;
  execute format('alter table public.content_items drop constraint %I', production_constraint);

  select con.conname into language_constraint
    from pg_constraint con
   where con.conrelid = 'public.content_items'::regclass
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%language_code%';
  if language_constraint is null then
    raise exception 'language constraint was not found';
  end if;
  execute format('alter table public.content_items drop constraint %I', language_constraint);
end $$;

alter table public.content_items
  add constraint content_items_format_check
  check (format in ('unknown', 'short_form', 'long_form', 'other'));

alter table public.content_items
  add constraint content_items_production_type_check
  check (production_type in ('unknown', 'new', 'remaster', 'repurpose', 'other'));

alter table public.content_items
  add constraint content_items_language_code_check
  check (
    language_code = 'und'
    or language_code ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'
  );

alter table public.content_items alter column format set default 'unknown';
alter table public.content_items alter column production_type set default 'unknown';
alter table public.content_items alter column language_code set default 'und';

create unique index platform_posts_owner_platform_post_id_idx
  on public.platform_posts (owner_id, platform, platform_post_id)
  where platform_post_id is not null;

comment on index public.platform_posts_owner_platform_post_id_idx is
  'One external post id per owner and platform. Titles are not identities. Null ids stay allowed for placeholders.';

comment on column public.platform_posts.published_at is
  'Optional. A post can be known published without an exact timestamp. Scheduled posts still require scheduled_at.';

comment on column public.content_items.language_code is
  'BCP 47 tag when the language is known. und means undetermined. Do not infer a language from a title, channel, or project.';

commit;