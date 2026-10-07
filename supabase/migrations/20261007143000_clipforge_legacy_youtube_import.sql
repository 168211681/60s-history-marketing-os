-- Sprint 004. Legacy YouTube rows can be imported without inventing a
-- publication time or a production classification. Do not rewrite earlier
-- migrations. Do not apply this file to Staging or Production from this branch.
begin;

do $$
declare
  published_constraint text;
  format_constraint text;
  production_constraint text;
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
end $$;

alter table public.content_items
  add constraint content_items_format_check
  check (format in ('unknown', 'short_form', 'long_form', 'other'));

alter table public.content_items
  add constraint content_items_production_type_check
  check (production_type in ('unknown', 'new', 'remaster', 'repurpose', 'other'));

alter table public.content_items alter column format set default 'unknown';
alter table public.content_items alter column production_type set default 'unknown';

create unique index platform_posts_owner_platform_post_id_idx
  on public.platform_posts (owner_id, platform, platform_post_id)
  where platform_post_id is not null;

comment on index public.platform_posts_owner_platform_post_id_idx is
  'One external post id per owner and platform. Titles are not identities. Null ids stay allowed for placeholders.';

comment on column public.platform_posts.published_at is
  'Optional. A post can be known published without an exact timestamp. Scheduled posts still require scheduled_at.';

commit;
