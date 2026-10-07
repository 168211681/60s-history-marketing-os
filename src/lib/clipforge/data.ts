import type { PoolClient } from "pg";
import { database, transaction } from "@/lib/database";
import { assetBucket, storageProvider, type AssetKind } from "./assets";
import {
  applyPlatformPatch,
  platforms,
  type Platform,
  type PlatformPostInput,
  type PlatformPostPatch,
  type PlatformStatus,
} from "./distribution";
import { escapeLike, type ContentInput, type ContentStatus, type ProjectInput } from "./model";

export type ProjectRecord = {
  id: string;
  name: string;
  code: string | null;
  description: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type ContentRecord = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string | null;
  contentKey: string | null;
  title: string;
  topic: string;
  format: ContentInput["format"];
  productionType: ContentInput["productionType"];
  status: ContentStatus;
  languageCode: string;
  durationSeconds: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  hasMasterVideo: boolean;
  hasThumbnail: boolean;
  distributionComplete: number;
};

type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  description: string;
  status: ProjectRecord["status"];
  created_at: Date | string;
  updated_at: Date | string;
};

type ContentRow = {
  id: string;
  project_id: string;
  project_name: string;
  project_code: string | null;
  content_key: string | null;
  title: string;
  topic: string;
  format: ContentRecord["format"];
  production_type: ContentRecord["productionType"];
  status: ContentStatus;
  language_code: string;
  duration_seconds: number | null;
  notes: string;
  created_at: Date | string;
  updated_at: Date | string;
  has_master_video: boolean;
  has_thumbnail: boolean;
  distribution_complete: number;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function project(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
function content(row: ContentRow): ContentRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectCode: row.project_code,
    contentKey: row.content_key,
    title: row.title,
    topic: row.topic,
    format: row.format,
    productionType: row.production_type,
    status: row.status,
    languageCode: row.language_code,
    durationSeconds: row.duration_seconds,
    notes: row.notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    hasMasterVideo: row.has_master_video,
    hasThumbnail: row.has_thumbnail,
    distributionComplete: Number(row.distribution_complete),
  };
}

const contentSelect = `
  select i.id, i.project_id, p.name as project_name, p.code as project_code,
         i.content_key, i.title, i.topic, i.format, i.production_type, i.status,
         i.language_code, i.duration_seconds, i.notes, i.created_at, i.updated_at,
         exists (
           select 1 from public.content_assets a
            where a.content_item_id = i.id and a.owner_id = i.owner_id and a.kind = 'master_video'
         ) as has_master_video,
         exists (
           select 1 from public.content_assets a
            where a.content_item_id = i.id and a.owner_id = i.owner_id and a.kind = 'thumbnail'
         ) as has_thumbnail,
         (
           select count(*) from public.platform_posts post
            where post.content_item_id = i.id and post.owner_id = i.owner_id
              and post.status in ('published', 'skipped')
         )::int as distribution_complete
    from public.content_items i
    join public.projects p on p.id = i.project_id and p.owner_id = i.owner_id
   where i.owner_id = $1`;

export async function listProjects(ownerId: string) {
  const result = await database().query<ProjectRow>(
    `select id, name, code, description, status, created_at, updated_at
       from public.projects
      where owner_id = $1
      order by updated_at desc, name asc`,
    [ownerId],
  );
  return result.rows.map(project);
}

export async function getProject(ownerId: string, id: string) {
  const result = await database().query<ProjectRow>(
    `select id, name, code, description, status, created_at, updated_at
       from public.projects
      where owner_id = $1 and id = $2`,
    [ownerId, id],
  );
  return result.rows[0] ? project(result.rows[0]) : null;
}

export async function createProject(ownerId: string, input: ProjectInput) {
  return transaction(async (client) => {
    await client.query("insert into public.users (id) values ($1) on conflict (id) do nothing", [ownerId]);
    const result = await client.query<ProjectRow>(
      `insert into public.projects (owner_id, name, code, description, status)
       values ($1, $2, $3, $4, $5)
       returning id, name, code, description, status, created_at, updated_at`,
      [ownerId, input.name, input.code, input.description, input.status],
    );
    return project(result.rows[0]);
  });
}

export async function updateProject(ownerId: string, id: string, input: Partial<ProjectInput>) {
  const values: unknown[] = [];
  const sets: string[] = [];
  for (const [column, value] of [
    ["name", input.name],
    ["code", input.code],
    ["description", input.description],
    ["status", input.status],
  ] as const) {
    if (value !== undefined) {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (!sets.length) return null;
  values.push(id, ownerId);
  const result = await database().query<ProjectRow>(
    `update public.projects set ${sets.join(", ")}
      where id = $${values.length - 1} and owner_id = $${values.length}
      returning id, name, code, description, status, created_at, updated_at`,
    values,
  );
  return result.rows[0] ? project(result.rows[0]) : null;
}

export async function listContentItems(ownerId: string, filter: { projectId?: string; status?: ContentStatus; query?: string }) {
  const values: unknown[] = [ownerId];
  const where = ["i.owner_id = $1"];
  if (filter.projectId) {
    values.push(filter.projectId);
    where.push(`i.project_id = $${values.length}`);
  }
  if (filter.status) {
    values.push(filter.status);
    where.push(`i.status = $${values.length}`);
  }
  if (filter.query) {
    values.push(escapeLike(filter.query));
    where.push(`(i.title ilike $${values.length} escape '\\' or i.topic ilike $${values.length} escape '\\' or i.content_key ilike $${values.length} escape '\\')`);
  }
  const result = await database().query<ContentRow>(
    `${contentSelect.replace("where i.owner_id = $1", `where ${where.join(" and ")}`)}
     order by i.updated_at desc, i.title asc`,
    values,
  );
  return result.rows.map(content);
}

export async function getContentItem(ownerId: string, id: string) {
  const result = await database().query<ContentRow>(`${contentSelect} and i.id = $2`, [ownerId, id]);
  return result.rows[0] ? content(result.rows[0]) : null;
}

async function ownedProject(client: PoolClient, ownerId: string, projectId: string) {
  const result = await client.query("select 1 from public.projects where id = $1 and owner_id = $2", [projectId, ownerId]);
  return result.rowCount === 1;
}

export async function createContentItem(ownerId: string, input: ContentInput) {
  return transaction(async (client) => {
    if (!(await ownedProject(client, ownerId, input.projectId))) return null;
    const inserted = await client.query<{ id: string }>(
      `insert into public.content_items (
         project_id, owner_id, content_key, title, topic, format, production_type,
         status, language_code, duration_seconds, notes
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id`,
      [
        input.projectId, ownerId, input.contentKey, input.title, input.topic, input.format,
        input.productionType, input.status, input.languageCode, input.durationSeconds, input.notes,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) return null;
    await ensurePlatformPosts(client, ownerId, id);
    return contentById(client, ownerId, id);
  });
}

export async function updateContentItem(ownerId: string, id: string, input: Partial<ContentInput>) {
  return transaction(async (client) => {
    if (input.projectId && !(await ownedProject(client, ownerId, input.projectId))) return null;
    const values: unknown[] = [];
    const sets: string[] = [];
    for (const [column, value] of [
      ["project_id", input.projectId],
      ["content_key", input.contentKey],
      ["title", input.title],
      ["topic", input.topic],
      ["format", input.format],
      ["production_type", input.productionType],
      ["status", input.status],
      ["language_code", input.languageCode],
      ["duration_seconds", input.durationSeconds],
      ["notes", input.notes],
    ] as const) {
      if (value !== undefined) {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (!sets.length) return null;
    values.push(id, ownerId);
    const result = await client.query<{ id: string }>(
      `update public.content_items set ${sets.join(", ")}
        where id = $${values.length - 1} and owner_id = $${values.length}
        returning id`,
      values,
    );
    if (!result.rows[0]) return null;
    return contentById(client, ownerId, id);
  });
}

async function contentById(client: PoolClient, ownerId: string, id: string) {
  const result = await client.query<ContentRow>(`${contentSelect} and i.id = $2`, [ownerId, id]);
  return result.rows[0] ? content(result.rows[0]) : null;
}

async function ensurePlatformPosts(client: PoolClient, ownerId: string, contentItemId: string) {
  await client.query(
    `insert into public.platform_posts (content_item_id, owner_id, platform)
     select i.id, i.owner_id, platform
       from public.content_items i
       cross join unnest($3::text[]) as platform
      where i.owner_id = $1 and i.id = $2
     on conflict (content_item_id, platform) do nothing`,
    [ownerId, contentItemId, platforms],
  );
}

export type AssetRecord = {
  id: string;
  contentItemId: string;
  kind: AssetKind;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type PlatformPostRecord = PlatformPostInput & {
  id: string;
  contentItemId: string;
  platform: Platform;
  updatedAt: string;
};

type AssetRow = {
  id: string;
  content_item_id: string;
  kind: AssetKind;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string | number;
  created_at: Date | string;
};

type PostRow = {
  id: string;
  content_item_id: string;
  platform: Platform;
  status: PlatformStatus;
  title: string;
  caption: string;
  hashtags: string;
  scheduled_at: Date | string | null;
  published_at: Date | string | null;
  post_url: string | null;
  platform_post_id: string | null;
  updated_at: Date | string;
};

function asset(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    kind: row.kind,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: iso(row.created_at),
  };
}

function post(row: PostRow): PlatformPostRecord {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    platform: row.platform,
    status: row.status,
    title: row.title,
    caption: row.caption,
    hashtags: row.hashtags,
    scheduledAt: row.scheduled_at ? iso(row.scheduled_at) : null,
    publishedAt: row.published_at ? iso(row.published_at) : null,
    postUrl: row.post_url,
    platformPostId: row.platform_post_id,
    updatedAt: iso(row.updated_at),
  };
}

export async function listAssets(ownerId: string, contentItemId: string) {
  const result = await database().query<AssetRow>(
    `select id, content_item_id, kind, storage_path, original_filename, mime_type, size_bytes, created_at
       from public.content_assets
      where owner_id = $1 and content_item_id = $2
      order by kind asc`,
    [ownerId, contentItemId],
  );
  return result.rows.map(asset);
}

export async function createAsset(
  ownerId: string,
  contentItemId: string,
  input: { kind: AssetKind; storagePath: string; originalFilename: string; mimeType: string; sizeBytes: number },
) {
  return transaction(async (client) => {
    const owned = await client.query("select 1 from public.content_items where id = $1 and owner_id = $2", [contentItemId, ownerId]);
    if (owned.rowCount !== 1) return null;
    const result = await client.query<AssetRow>(
      `insert into public.content_assets (
         content_item_id, owner_id, kind, storage_provider, storage_bucket, storage_path, original_filename, mime_type, size_bytes
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning id, content_item_id, kind, storage_path, original_filename, mime_type, size_bytes, created_at`,
      [contentItemId, ownerId, input.kind, storageProvider, assetBucket, input.storagePath, input.originalFilename, input.mimeType, input.sizeBytes],
    );
    return asset(result.rows[0]);
  });
}

export async function getAsset(ownerId: string, contentItemId: string, assetId: string) {
  const result = await database().query<AssetRow>(
    `select id, content_item_id, kind, storage_path, original_filename, mime_type, size_bytes, created_at
       from public.content_assets
      where owner_id = $1 and content_item_id = $2 and id = $3`,
    [ownerId, contentItemId, assetId],
  );
  return result.rows[0] ? asset(result.rows[0]) : null;
}

export async function deleteAsset(ownerId: string, contentItemId: string, assetId: string) {
  const result = await database().query<AssetRow>(
    `delete from public.content_assets
      where owner_id = $1 and content_item_id = $2 and id = $3
      returning id, content_item_id, kind, storage_path, original_filename, mime_type, size_bytes, created_at`,
    [ownerId, contentItemId, assetId],
  );
  return result.rows[0] ? asset(result.rows[0]) : null;
}

export async function listPlatformPosts(ownerId: string, contentItemId: string) {
  return transaction(async (client) => {
    const owned = await client.query("select 1 from public.content_items where id = $1 and owner_id = $2", [contentItemId, ownerId]);
    if (owned.rowCount !== 1) return null;
    await ensurePlatformPosts(client, ownerId, contentItemId);
    const result = await client.query<PostRow>(
      `select id, content_item_id, platform, status, title, caption, hashtags,
              scheduled_at, published_at, post_url, platform_post_id, updated_at
         from public.platform_posts
        where owner_id = $1 and content_item_id = $2
        order by array_position($3::text[], platform)`,
      [ownerId, contentItemId, platforms],
    );
    return result.rows.map(post);
  });
}

export async function updatePlatformPost(ownerId: string, contentItemId: string, platform: Platform, patch: PlatformPostPatch) {
  return transaction(async (client) => {
    await ensurePlatformPosts(client, ownerId, contentItemId);
    const current = await client.query<PostRow>(
      `select id, content_item_id, platform, status, title, caption, hashtags,
              scheduled_at, published_at, post_url, platform_post_id, updated_at
         from public.platform_posts
        where owner_id = $1 and content_item_id = $2 and platform = $3
        for update`,
      [ownerId, contentItemId, platform],
    );
    const row = current.rows[0];
    if (!row) return null;
    const next = applyPlatformPatch(post(row), patch, new Date().toISOString());
    if (!next) return undefined;
    const result = await client.query<PostRow>(
      `update public.platform_posts
          set status = $4, title = $5, caption = $6, hashtags = $7,
              scheduled_at = $8, published_at = $9, post_url = $10, platform_post_id = $11
        where owner_id = $1 and content_item_id = $2 and platform = $3
        returning id, content_item_id, platform, status, title, caption, hashtags,
                  scheduled_at, published_at, post_url, platform_post_id, updated_at`,
      [
        ownerId, contentItemId, platform, next.status, next.title, next.caption, next.hashtags,
        next.scheduledAt, next.publishedAt, next.postUrl, next.platformPostId,
      ],
    );
    return result.rows[0] ? post(result.rows[0]) : null;
  });
}

export type DistributionCard = {
  id: string;
  contentKey: string | null;
  title: string;
  projectId: string;
  projectName: string;
  hasThumbnail: boolean;
  thumbnailPath: string | null;
  posts: PlatformPostRecord[];
};

export async function listDistribution(
  ownerId: string,
  filter: { projectId?: string; platform?: Platform; status?: PlatformStatus },
) {
  return transaction(async (client) => {
    await client.query(
      `insert into public.platform_posts (content_item_id, owner_id, platform)
       select i.id, i.owner_id, platform
         from public.content_items i
         cross join unnest($2::text[]) as platform
        where i.owner_id = $1
       on conflict (content_item_id, platform) do nothing`,
      [ownerId, platforms],
    );
    const values: unknown[] = [ownerId, platforms];
    const where = ["i.owner_id = $1"];
    if (filter.projectId) {
      values.push(filter.projectId);
      where.push(`i.project_id = $${values.length}`);
    }
    if (filter.platform) {
      values.push(filter.platform);
      where.push(`exists (
        select 1 from public.platform_posts match
         where match.content_item_id = i.id and match.owner_id = i.owner_id
           and match.platform = $${values.length}
           ${filter.status ? `and match.status = $${values.length + 1}` : ""}
      )`);
    }
    if (filter.status) values.push(filter.status);
    if (!filter.platform && filter.status) {
      where.push(`exists (
        select 1 from public.platform_posts match
         where match.content_item_id = i.id and match.owner_id = i.owner_id
           and match.status = $${values.length}
      )`);
    }
    const result = await client.query<{
      id: string;
      content_key: string | null;
      title: string;
      project_id: string;
      project_name: string;
      thumbnail_path: string | null;
      posts: PostRow[] | string;
    }>(
      `select i.id, i.content_key, i.title, i.project_id, p.name as project_name,
              (
                select a.storage_path from public.content_assets a
                 where a.content_item_id = i.id and a.owner_id = i.owner_id and a.kind = 'thumbnail'
              ) as thumbnail_path,
              coalesce((
                select json_agg(json_build_object(
                  'id', post.id,
                  'content_item_id', post.content_item_id,
                  'platform', post.platform,
                  'status', post.status,
                  'title', post.title,
                  'caption', post.caption,
                  'hashtags', post.hashtags,
                  'scheduled_at', post.scheduled_at,
                  'published_at', post.published_at,
                  'post_url', post.post_url,
                  'platform_post_id', post.platform_post_id,
                  'updated_at', post.updated_at
                ) order by array_position($2::text[], post.platform))
                  from public.platform_posts post
                 where post.content_item_id = i.id and post.owner_id = i.owner_id
              ), '[]'::json) as posts
         from public.content_items i
         join public.projects p on p.id = i.project_id and p.owner_id = i.owner_id
        where ${where.join(" and ")}
        order by i.updated_at desc, i.title asc`,
      values,
    );
    return result.rows.map((row) => {
      const posts = typeof row.posts === "string" ? JSON.parse(row.posts) as PostRow[] : row.posts;
      return {
        id: row.id,
        contentKey: row.content_key,
        title: row.title,
        projectId: row.project_id,
        projectName: row.project_name,
        hasThumbnail: Boolean(row.thumbnail_path),
        thumbnailPath: row.thumbnail_path,
        posts: (Array.isArray(posts) ? posts : []).map((item) => post(normalizePost(item))),
      };
    });
  });
}

function normalizePost(value: PostRow | Record<string, unknown>): PostRow {
  const row = value as PostRow & Record<string, unknown>;
  return {
    id: String(row.id),
    content_item_id: String(row.content_item_id),
    platform: row.platform,
    status: row.status,
    title: String(row.title ?? ""),
    caption: String(row.caption ?? ""),
    hashtags: String(row.hashtags ?? ""),
    scheduled_at: (row.scheduled_at as Date | string | null) ?? null,
    published_at: (row.published_at as Date | string | null) ?? null,
    post_url: (row.post_url as string | null) ?? null,
    platform_post_id: (row.platform_post_id as string | null) ?? null,
    updated_at: (row.updated_at as Date | string) ?? new Date(0).toISOString(),
  };
}
