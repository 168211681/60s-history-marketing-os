// Shared by single-item reads and the queue. No writes or full history loads.
export const classificationReadBatchSize = 100;

export const classificationContextSelect = `select i.title, i.id, i.project_id, p.name as project_name, i.created_at::text as scan_created_at, i.topic, i.production_type, i.content_pillar, p.code as project_code,
            v.youtube_video_id, v.title as source_title, v.description, v.tags, v.category_id,
            v.default_language, v.default_audio_language, v.privacy_status, v.metadata_synced_at
       from public.content_items i
       join public.projects p on p.id = i.project_id and p.owner_id = i.owner_id
       left join lateral (
         select v.youtube_video_id, v.title, v.description, v.tags, v.category_id,
                v.default_language, v.default_audio_language, v.privacy_status, v.metadata_synced_at
           from public.platform_posts pp
           join public.videos v on v.youtube_video_id = pp.platform_post_id
           join public.channels c on c.id = v.channel_id and c.owner_id = pp.owner_id
          where pp.owner_id = i.owner_id
            and pp.content_item_id = i.id
            and pp.platform = 'youtube'
            and pp.platform_post_id is not null
          order by v.published_at nulls last, c.id
          limit 1
       ) v on true
`;

const suggestionColumns = `
  s.id, s.content_item_id, s.suggested_topic, s.suggested_content_pillar, s.suggested_production_type,
  s.topic_confidence::text, s.pillar_confidence::text, s.production_type_confidence::text,
  s.topic_rationale, s.pillar_rationale, s.production_type_rationale,
  s.provider, s.model, s.prompt_version, s.source_fingerprint, s.source_metadata_synced_at,
  s.status, s.accepted_fields, s.created_at, s.reviewed_at`;

// Preserve the single-item rule: exact fingerprint + prompt first (even if
// superseded), otherwise latest non-superseded. A UUID tie-break makes equal
// timestamps deterministic. Each indexed candidate lookup returns at most one.
export const currentSuggestionsSql = `
  select chosen.*
    from unnest($2::uuid[], $3::text[]) as input(content_item_id, fingerprint)
    join public.content_items i on i.id = input.content_item_id and i.owner_id = $1
    join public.projects p on p.id = i.project_id and p.owner_id = i.owner_id
    cross join lateral (
      (select 0 as priority, ${suggestionColumns}
         from public.content_classification_suggestions s
        where s.owner_id = i.owner_id and s.content_item_id = i.id
          and s.prompt_version = $4 and s.source_fingerprint = input.fingerprint
        order by s.created_at desc, s.id desc limit 1)
      union all
      (select 1 as priority, ${suggestionColumns}
         from public.content_classification_suggestions s
        where s.owner_id = i.owner_id and s.content_item_id = i.id and s.status <> 'superseded'
        order by s.created_at desc, s.id desc limit 1)
      order by priority limit 1
    ) chosen
   limit ${classificationReadBatchSize}`;

export const reviewContextsSql = `${classificationContextSelect}
  where i.owner_id = $1
    and ($2::uuid is null or i.project_id = $2)
    and ($3::text = '' or i.title ilike $3)
    and ($4::timestamptz is null or (i.created_at, i.id) < ($4::timestamptz, $5::uuid))
  order by i.created_at desc, i.id desc
  limit ${classificationReadBatchSize}`;

export const reviewProjectsSql = `
  select id, name from public.projects
   where owner_id = $1 and ($2::uuid is null or id > $2::uuid)
   order by id limit ${classificationReadBatchSize}`;
