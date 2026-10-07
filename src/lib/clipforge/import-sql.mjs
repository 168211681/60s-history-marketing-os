const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const usablePredicate = `
  identity_rank = 1
  and youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
  and length(btrim(title)) between 1 and 200
  and length(title) <= 200
`;

const sourceCte = `
source as materialized (
  select c.id as channel_id,
         c.title as channel_title,
         v.youtube_video_id,
         v.title,
         coalesce(nullif(btrim(v.topic), ''), '') as topic,
         v.published_at,
         case
           when v.duration_seconds is not null
            and v.duration_seconds = trunc(v.duration_seconds)
            and v.duration_seconds >= 0
            and v.duration_seconds <= 86400
           then v.duration_seconds::integer
           else null
         end as duration_seconds,
         case
           when v.default_audio_language ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'
            and v.default_audio_language <> 'und' then v.default_audio_language
           when v.default_language ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'
            and v.default_language <> 'und' then v.default_language
           else null
         end as source_language,
         row_number() over (
           partition by v.youtube_video_id
           order by v.published_at nulls last, c.id
         ) as identity_rank
    from public.videos v
    join public.channels c on c.id = v.channel_id
   where c.owner_id = $2::uuid
     and exists (select 1 from locked)
)`;

export const youtubePreviewSql = `
with project as materialized (
  select id, name
    from public.projects
   where id = $1::uuid and owner_id = $2::uuid
),
locked as (
  select 1 as acquired
),
${sourceCte},
usable as materialized (
  select youtube_video_id
    from source
   where ${usablePredicate}
),
linked as materialized (
  select platform_post_id
    from public.platform_posts
   where owner_id = $2::uuid
     and platform = 'youtube'
     and platform_post_id is not null
),
counts as (
  select (select count(*) from source) as found,
         (select count(*) from usable u where not exists (
            select 1 from linked l where l.platform_post_id = u.youtube_video_id
         )) as new_items,
         (select count(*) from usable u where exists (
            select 1 from linked l where l.platform_post_id = u.youtube_video_id
         )) as already_imported,
         (select count(*) from source) - (select count(*) from usable) as invalid
)
select p.name as project_name,
       coalesce((
         select array_agg(distinct s.channel_title order by s.channel_title)
           from source s
       ), '{}'::text[]) as channel_titles,
       counts.found,
       counts.new_items,
       counts.already_imported,
       counts.invalid
  from project p
 cross join counts
`;

export const youtubeImportSql = `
with locked as (
  select pg_advisory_xact_lock(hashtextextended($2::text, 4)) as acquired
),
project as materialized (
  select id
    from public.projects
   where id = $1::uuid and owner_id = $2::uuid
),
${sourceCte},
usable as materialized (
  select *
    from source
   where ${usablePredicate}
),
linked as materialized (
  select platform_post_id
    from public.platform_posts
   where owner_id = $2::uuid
     and platform = 'youtube'
     and platform_post_id is not null
),
fresh as materialized (
  select u.*, gen_random_uuid() as content_id
    from usable u
   where exists (select 1 from project)
     and not exists (
       select 1 from linked l where l.platform_post_id = u.youtube_video_id
     )
),
inserted_items as (
  insert into public.content_items (
    id, project_id, owner_id, content_key, title, topic, format, production_type,
    status, language_code, duration_seconds, notes
  )
  select f.content_id, p.id, $2::uuid, null, f.title, f.topic, 'unknown', 'unknown',
         'published', coalesce(f.source_language, 'und'), f.duration_seconds, ''
    from fresh f
   cross join project p
  returning id
),
inserted_posts as (
  insert into public.platform_posts (
    content_item_id, owner_id, platform, status, title, caption, hashtags,
    scheduled_at, published_at, post_url, platform_post_id
  )
  select f.content_id,
         $2::uuid,
         plat.platform,
         case when plat.platform = 'youtube' then 'published' else 'not_started' end,
         case when plat.platform = 'youtube' then f.title else '' end,
         '',
         '',
         null,
         case when plat.platform = 'youtube' then f.published_at else null end,
         case when plat.platform = 'youtube'
              then 'https://www.youtube.com/watch?v=' || f.youtube_video_id
              else null end,
         case when plat.platform = 'youtube' then f.youtube_video_id else null end
    from fresh f
   cross join project p
   cross join (values ('youtube'), ('facebook'), ('tiktok'), ('instagram')) as plat(platform)
  returning content_item_id
),
updated_posts as (
  update public.platform_posts pp
     set title = u.title,
         post_url = 'https://www.youtube.com/watch?v=' || u.youtube_video_id,
         published_at = case when u.published_at is not null then u.published_at else pp.published_at end
    from usable u
   where pp.owner_id = $2::uuid
     and pp.platform = 'youtube'
     and pp.platform_post_id = u.youtube_video_id
     and exists (select 1 from project)
     and (
       pp.title is distinct from u.title
       or pp.post_url is distinct from ('https://www.youtube.com/watch?v=' || u.youtube_video_id)
       or (u.published_at is not null and pp.published_at is distinct from u.published_at)
     )
  returning pp.content_item_id
),
updated_durations as (
  update public.content_items i
     set duration_seconds = u.duration_seconds
    from usable u
    join public.platform_posts pp
      on pp.owner_id = $2::uuid
     and pp.platform = 'youtube'
     and pp.platform_post_id = u.youtube_video_id
   where i.id = pp.content_item_id
     and i.owner_id = $2::uuid
     and u.duration_seconds is not null
     and i.duration_seconds is distinct from u.duration_seconds
     and exists (select 1 from project)
  returning i.id
),
updated_languages as (
  update public.content_items i
     set language_code = u.source_language
    from usable u
    join public.platform_posts pp
      on pp.owner_id = $2::uuid
     and pp.platform = 'youtube'
     and pp.platform_post_id = u.youtube_video_id
   where i.id = pp.content_item_id
     and i.owner_id = $2::uuid
     and i.language_code = 'und'
     and u.source_language is not null
     and i.language_code is distinct from u.source_language
     and exists (select 1 from project)
  returning i.id
)
select exists (select 1 from project) as project_found,
       (select count(*) from source) as found,
       (select count(*) from inserted_items) as created,
       (select count(*) from inserted_posts) as created_posts,
       (select count(*) from usable u where exists (
          select 1 from linked l where l.platform_post_id = u.youtube_video_id
       )) as already_linked,
       (select count(*) from (
          select content_item_id as id from updated_posts
          union
          select id from updated_durations
          union
          select id from updated_languages
       ) changed) as updated,
       (select count(*) from source) - (select count(*) from usable) as skipped
`;

export function bindImportSql(statement, projectId, ownerId) {
  if (!uuidPattern.test(projectId) || !uuidPattern.test(ownerId)) {
    throw new Error("Import identity is invalid");
  }
  return statement
    .replaceAll("$1::uuid", `'${projectId}'::uuid`)
    .replaceAll("$2::uuid", `'${ownerId}'::uuid`)
    .replaceAll("$2::text", `'${ownerId}'::text`);
}
