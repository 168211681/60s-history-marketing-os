// Channel before video, matching YouTube completeSyncJob (channel FOR UPDATE, then videos).
const classificationLockStatements = [
  `select id
     from public.content_items
    where owner_id = $1 and id = $2
    for update`,
  `select p.id
     from public.projects p
     join public.content_items i on i.project_id = p.id and i.owner_id = p.owner_id
    where i.owner_id = $1 and i.id = $2
    order by p.id
    for share of p`,
  `select pp.id
     from public.platform_posts pp
    where pp.owner_id = $1
      and pp.content_item_id = $2
      and pp.platform = 'youtube'
      and pp.platform_post_id is not null
    order by pp.id
    for share of pp`,
  `select c.id
     from public.channels c
    where c.owner_id = $1
      and c.id in (
        select distinct v.channel_id
          from public.platform_posts pp
          join public.videos v on v.youtube_video_id = pp.platform_post_id
          join public.channels owner_channel
            on owner_channel.id = v.channel_id and owner_channel.owner_id = pp.owner_id
         where pp.owner_id = $1
           and pp.content_item_id = $2
           and pp.platform = 'youtube'
           and pp.platform_post_id is not null
      )
    order by c.id
    for share of c`,
  `select v.id
     from public.platform_posts pp
     join public.videos v on v.youtube_video_id = pp.platform_post_id
     join public.channels c on c.id = v.channel_id and c.owner_id = pp.owner_id
    where pp.owner_id = $1
      and pp.content_item_id = $2
      and pp.platform = 'youtube'
      and pp.platform_post_id is not null
    order by v.id
    for share of v`,
];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function classificationLocksSql(ownerId, contentItemId) {
  if (!uuidPattern.test(ownerId) || !uuidPattern.test(contentItemId)) {
    throw new Error("classification lock parameters must be uuids");
  }
  return classificationLockStatements
    .map((statement) => statement.replaceAll("$2", `'${contentItemId}'`).replaceAll("$1", `'${ownerId}'`))
    .join(";\n")
    .concat(";");
}

export { classificationLockStatements, classificationLocksSql };
