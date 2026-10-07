-- ClipForge assets and manual distribution.
-- Pending until a separate reviewed apply. Do not apply to Staging or Production
-- from this branch. Do not rewrite earlier migrations.
begin;

alter table public.content_items
  add constraint content_items_id_owner_id_key unique (id, owner_id);

create index content_items_project_id_owner_id_idx
  on public.content_items (project_id, owner_id);

create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null,
  owner_id uuid not null,
  kind text not null check (kind in ('master_video', 'thumbnail')),
  storage_provider text not null default 'r2' check (storage_provider = 'r2'),
  storage_bucket text not null default 'clipforge-assets' check (storage_bucket = 'clipforge-assets'),
  storage_path text not null,
  original_filename text not null check (
    length(btrim(original_filename)) between 1 and 180
    and strpos(original_filename, '/') = 0
    and strpos(original_filename, E'\\') = 0
  ),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 1 and size_bytes <= 536870912),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_item_id, kind),
  unique (storage_bucket, storage_path),
  foreign key (content_item_id, owner_id) references public.content_items (id, owner_id) on delete cascade,
  check (
    (kind = 'master_video' and mime_type in ('video/mp4', 'video/quicktime'))
    or (kind = 'thumbnail' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))
  ),
  check (
    cardinality(string_to_array(storage_path, '/')) = 4
    and split_part(storage_path, '/', 1) = owner_id::text
    and split_part(storage_path, '/', 2) = content_item_id::text
    and split_part(storage_path, '/', 3) = kind
    and storage_path !~ '\.\.'
    and split_part(storage_path, '/', 4) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
  )
);
create index content_assets_owner_item_idx on public.content_assets (owner_id, content_item_id);
comment on table public.content_assets is
  'Private ClipForge file pointer. Bytes live in Cloudflare R2 bucket clipforge-assets, not in Postgres.';

create table public.platform_posts (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null,
  owner_id uuid not null,
  platform text not null check (platform in ('youtube', 'facebook', 'tiktok', 'instagram')),
  status text not null default 'not_started' check (status in ('not_started', 'ready', 'scheduled', 'published', 'skipped')),
  title text not null default '' check (length(title) <= 200),
  caption text not null default '' check (length(caption) <= 5000),
  hashtags text not null default '' check (length(hashtags) <= 500),
  scheduled_at timestamptz,
  published_at timestamptz,
  post_url text,
  platform_post_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_item_id, platform),
  foreign key (content_item_id, owner_id) references public.content_items (id, owner_id) on delete cascade,
  check (status <> 'scheduled' or scheduled_at is not null),
  check (status <> 'published' or published_at is not null),
  check (
    post_url is null
    or (
      length(post_url) between 12 and 2000
      and post_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+(:[0-9]{1,5})?(/[^\s]*)?$'
    )
  ),
  check (
    platform_post_id is null
    or (
      length(btrim(platform_post_id)) between 1 and 200
      and platform_post_id !~ '[[:space:]]'
    )
  )
);
create index platform_posts_owner_status_idx on public.platform_posts (owner_id, status);
comment on table public.platform_posts is
  'Manual per-platform copy and posting record. This table does not publish to a platform.';

do $$
declare table_name text;
begin
  foreach table_name in array array['content_assets', 'platform_posts'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
  end loop;
end $$;

grant insert (
  content_item_id, owner_id, kind, storage_provider, storage_bucket, storage_path, original_filename, mime_type, size_bytes
) on public.content_assets to authenticated;
grant update (original_filename, mime_type, size_bytes) on public.content_assets to authenticated;
grant delete on public.content_assets to authenticated;

grant insert (content_item_id, owner_id, platform, status, title, caption, hashtags, scheduled_at, published_at, post_url, platform_post_id)
  on public.platform_posts to authenticated;
grant update (status, title, caption, hashtags, scheduled_at, published_at, post_url, platform_post_id)
  on public.platform_posts to authenticated;
grant delete on public.platform_posts to authenticated;

create policy content_assets_select_own on public.content_assets for select to authenticated
  using (owner_id = (select auth.uid()));
create policy content_assets_insert_own on public.content_assets for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and content_item_id in (select id from public.content_items where owner_id = (select auth.uid()))
  );
create policy content_assets_update_own on public.content_assets for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and content_item_id in (select id from public.content_items where owner_id = (select auth.uid()))
  );
create policy content_assets_delete_own on public.content_assets for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy platform_posts_select_own on public.platform_posts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy platform_posts_insert_own on public.platform_posts for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and content_item_id in (select id from public.content_items where owner_id = (select auth.uid()))
  );
create policy platform_posts_update_own on public.platform_posts for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and content_item_id in (select id from public.content_items where owner_id = (select auth.uid()))
  );
create policy platform_posts_delete_own on public.platform_posts for delete to authenticated
  using (owner_id = (select auth.uid()));

commit;
