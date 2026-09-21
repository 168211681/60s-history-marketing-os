import { database, transaction } from "@/lib/database";
import { decryptToken, encryptToken, tokenEncryptionConfigured } from "./crypto";
import { googleConfig, refreshAccessToken } from "./google";
import type { ChannelMetric, SyncPeriod, VideoMetadata, VideoMetric } from "./sync";

type ConnectionRow = { channel_id: string; youtube_channel_id: string; title: string; last_synced_at: Date | null };
type SecretRow = { encrypted_refresh_token: string };

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL && tokenEncryptionConfigured());
}

export async function connectionForOwner(ownerId: string): Promise<ConnectionRow | null> {
  const result = await database().query<ConnectionRow>(
    `select c.id as channel_id, c.youtube_channel_id, c.title, c.last_synced_at
       from private.youtube_connections yc
       join public.channels c on c.id = yc.channel_id and c.owner_id = yc.owner_id
      where yc.owner_id = $1`,
    [ownerId],
  );
  return result.rows[0] ?? null;
}

export async function saveConnection(ownerId: string, channel: { id: string; title: string }, refreshToken: string, scopes: string) {
  const encrypted = encryptToken(refreshToken);
  return transaction(async (client) => {
    await client.query("insert into public.users (id) values ($1) on conflict (id) do nothing", [ownerId]);
    const channelResult = await client.query<{ id: string }>(
      `insert into public.channels (owner_id, youtube_channel_id, title)
       values ($1, $2, $3)
       on conflict (youtube_channel_id) do update set title = excluded.title
       where public.channels.owner_id = excluded.owner_id
       returning id`,
      [ownerId, channel.id, channel.title],
    );
    const channelId = channelResult.rows[0]?.id;
    if (!channelId) throw new Error("Channel belongs to another owner");
    const saved = await client.query(
      `insert into private.youtube_connections (owner_id, channel_id, encrypted_refresh_token, scopes)
       values ($1, $2, $3, $4)
       on conflict (owner_id) do update
         set encrypted_refresh_token = excluded.encrypted_refresh_token,
             scopes = excluded.scopes
       where private.youtube_connections.channel_id = excluded.channel_id
       returning owner_id`,
      [ownerId, channelId, encrypted, scopes],
    );
    if (!saved.rowCount) throw new Error("Disconnect the current channel before connecting another");
    return channelId;
  });
}

async function secretForOwner(ownerId: string) {
  const result = await database().query<SecretRow>(
    "select encrypted_refresh_token from private.youtube_connections where owner_id = $1",
    [ownerId],
  );
  return result.rows[0] ? decryptToken(result.rows[0].encrypted_refresh_token) : null;
}

export async function accessTokenForOwner(ownerId: string) {
  const config = googleConfig();
  if (!config) throw new Error("Google connection is not configured");
  const refreshToken = await secretForOwner(ownerId);
  if (!refreshToken) return null;
  return refreshAccessToken(config, refreshToken);
}

export type VideoTranscript = {
  id: string;
  youtubeVideoId: string;
  title: string;
  languageCode: string;
  trackKind: string;
  source: string;
  transcript: string;
  fetchedAt: string;
};

export async function upsertVideoTranscript(
  ownerId: string,
  youtubeVideoId: string,
  input: { languageCode: string; trackKind: string; source: "youtube_captions" | "owner_upload" | "local_transcription"; transcript: string },
) {
  const result = await database().query<VideoTranscript>(
    `insert into public.video_transcripts
       (channel_id, video_id, youtube_video_id, language_code, track_kind, source, transcript, fetched_at)
     select c.id, v.id, v.youtube_video_id, $3, $4, $5, $6, now()
       from public.channels c
       join public.videos v on v.channel_id = c.id and v.youtube_video_id = $2
      where c.owner_id = $1
     on conflict (video_id, language_code, source) do update set
       track_kind = excluded.track_kind, transcript = excluded.transcript,
       fetched_at = now(), updated_at = now()
     returning id, youtube_video_id as "youtubeVideoId", '' as title,
       language_code as "languageCode", track_kind as "trackKind", source,
       transcript, fetched_at as "fetchedAt"`,
    [ownerId, youtubeVideoId, input.languageCode.trim(), input.trackKind, input.source, input.transcript.trim()],
  );
  if (!result.rows[0]) throw new Error("VIDEO_NOT_OWNED_OR_NOT_SYNCED");
  const title = await database().query<{ title: string }>(
    `select v.title from public.videos v join public.channels c on c.id = v.channel_id
      where c.owner_id = $1 and v.youtube_video_id = $2`,
    [ownerId, youtubeVideoId],
  );
  return { ...result.rows[0], title: title.rows[0]?.title ?? "" };
}

export async function videoTranscriptForOwner(ownerId: string, youtubeVideoId: string) {
  const result = await database().query<VideoTranscript>(
    `select t.id, t.youtube_video_id as "youtubeVideoId", v.title,
            t.language_code as "languageCode", t.track_kind as "trackKind",
            t.source, t.transcript, t.fetched_at as "fetchedAt"
       from public.video_transcripts t
       join public.videos v on v.id = t.video_id
       join public.channels c on c.id = t.channel_id and c.id = v.channel_id
      where c.owner_id = $1 and t.youtube_video_id = $2
      order by t.fetched_at desc, t.created_at desc
      limit 1`,
    [ownerId, youtubeVideoId],
  );
  return result.rows[0] ?? null;
}

export async function videoTranscriptsForOwner(ownerId: string, limit = 20) {
  const result = await database().query<VideoTranscript>(
    `select distinct on (t.youtube_video_id)
            t.id, t.youtube_video_id as "youtubeVideoId", v.title,
            t.language_code as "languageCode", t.track_kind as "trackKind",
            t.source, t.transcript, t.fetched_at as "fetchedAt"
       from public.video_transcripts t
       join public.videos v on v.id = t.video_id
       join public.channels c on c.id = t.channel_id and c.id = v.channel_id
      where c.owner_id = $1
      order by t.youtube_video_id, t.fetched_at desc
      limit $2`,
    [ownerId, Math.min(Math.max(limit, 1), 50)],
  );
  return result.rows;
}

export async function removeConnection(ownerId: string) {
  return transaction(async (client) => {
    const deleted = await client.query<{ encrypted_refresh_token: string; channel_id: string }>(
      `delete from private.youtube_connections where owner_id = $1
       returning encrypted_refresh_token, channel_id`,
      [ownerId],
    );
    const row = deleted.rows[0];
    if (!row) return null;
    await client.query("delete from public.channels where id = $1 and owner_id = $2", [row.channel_id, ownerId]);
    return decryptToken(row.encrypted_refresh_token);
  });
}

export type SyncJobStart =
  | { kind: "started"; jobId: string }
  | { kind: "existing"; status: "running" | "succeeded" };

export async function beginSyncJob(channelId: string, period: SyncPeriod): Promise<SyncJobStart> {
  const key = `youtube-daily-v1:${period.start}:${period.end}`;
  const started = await database().query<{ id: string }>(
    `insert into private.analytics_sync_jobs as jobs
       (channel_id, idempotency_key, period_start, period_end, status, attempts, started_at)
     values ($1, $2, $3, $4, 'running', 1, now())
     on conflict (channel_id, idempotency_key) do update
       set status = 'running', attempts = jobs.attempts + 1, error_code = null,
           started_at = now(), finished_at = null
       where jobs.status = 'failed'
          or (jobs.status = 'running' and jobs.started_at < now() - interval '15 minutes')
     returning id`,
    [channelId, key, period.start, period.end],
  );
  if (started.rows[0]) return { kind: "started", jobId: started.rows[0].id };
  const existing = await database().query<{ status: "running" | "succeeded" }>(
    `select status from private.analytics_sync_jobs
      where channel_id = $1 and idempotency_key = $2 and status in ('running', 'succeeded')`,
    [channelId, key],
  );
  if (!existing.rows[0]) throw new Error("Sync job could not be acquired");
  return { kind: "existing", status: existing.rows[0].status };
}

type SyncPayload = {
  videos: VideoMetadata[];
  channelMetrics: ChannelMetric[];
  videoMetrics: VideoMetric[];
};

function metricJson(metrics: ChannelMetric[]) {
  return metrics.map((metric) => ({
    metric_date: metric.metricDate,
    views: metric.views,
    estimated_minutes_watched: metric.estimatedMinutesWatched,
    average_view_duration_seconds: metric.averageViewDurationSeconds,
    subscribers_gained: metric.subscribersGained,
    subscribers_lost: metric.subscribersLost,
    likes: metric.likes,
    comments: metric.comments,
  }));
}

export async function completeSyncJob(ownerId: string, channelId: string, jobId: string, payload: SyncPayload) {
  return transaction(async (client) => {
    const owned = await client.query(
      "select 1 from public.channels where id = $1 and owner_id = $2 for update",
      [channelId, ownerId],
    );
    if (!owned.rowCount) throw new Error("Channel ownership changed");

    if (payload.videos.length) {
      await client.query(
        `with incoming as (
           select * from jsonb_to_recordset($2::jsonb) as x(
             youtube_video_id text, title text, published_at timestamptz, duration_seconds numeric
           )
         )
         insert into public.videos (channel_id, youtube_video_id, title, published_at, duration_seconds)
         select $1, youtube_video_id, title, published_at, duration_seconds from incoming
         on conflict (channel_id, youtube_video_id) do update
           set title = excluded.title, published_at = excluded.published_at,
               duration_seconds = excluded.duration_seconds`,
        [channelId, JSON.stringify(payload.videos.map((video) => ({
          youtube_video_id: video.youtubeVideoId,
          title: video.title,
          published_at: video.publishedAt,
          duration_seconds: video.durationSeconds,
        })))],
      );
    }

    if (payload.channelMetrics.length) {
      await client.query(
        `with incoming as (
           select * from jsonb_to_recordset($2::jsonb) as x(
             metric_date date, views bigint, estimated_minutes_watched numeric,
             average_view_duration_seconds numeric, subscribers_gained bigint,
             subscribers_lost bigint, likes bigint, comments bigint
           )
         )
         insert into public.channel_metrics
           (channel_id, metric_date, views, estimated_minutes_watched,
            average_view_duration_seconds, subscribers_gained, subscribers_lost, likes, comments, collected_at)
         select $1, metric_date, views, estimated_minutes_watched,
                average_view_duration_seconds, subscribers_gained, subscribers_lost, likes, comments, now()
           from incoming
         on conflict (channel_id, metric_date) do update set
           views = excluded.views, estimated_minutes_watched = excluded.estimated_minutes_watched,
           average_view_duration_seconds = excluded.average_view_duration_seconds,
           subscribers_gained = excluded.subscribers_gained, subscribers_lost = excluded.subscribers_lost,
           likes = excluded.likes, comments = excluded.comments, collected_at = now()`,
        [channelId, JSON.stringify(metricJson(payload.channelMetrics))],
      );
    }

    if (payload.videoMetrics.length) {
      const savedMetrics = await client.query(
        `with incoming as (
           select * from jsonb_to_recordset($2::jsonb) as x(
             youtube_video_id text, metric_date date, views bigint,
             estimated_minutes_watched numeric, average_view_duration_seconds numeric,
             subscribers_gained bigint, subscribers_lost bigint, likes bigint, comments bigint
           )
         )
         insert into public.video_metrics
           (channel_id, video_id, metric_date, views, estimated_minutes_watched,
            average_view_duration_seconds, subscribers_gained, subscribers_lost, likes, comments, collected_at)
         select $1, v.id, i.metric_date, i.views, i.estimated_minutes_watched,
                i.average_view_duration_seconds, i.subscribers_gained, i.subscribers_lost,
                i.likes, i.comments, now()
           from incoming i
           join public.videos v on v.channel_id = $1 and v.youtube_video_id = i.youtube_video_id
         on conflict (video_id, metric_date) do update set
           views = excluded.views, estimated_minutes_watched = excluded.estimated_minutes_watched,
           average_view_duration_seconds = excluded.average_view_duration_seconds,
           subscribers_gained = excluded.subscribers_gained, subscribers_lost = excluded.subscribers_lost,
           likes = excluded.likes, comments = excluded.comments, collected_at = now()`,
        [channelId, JSON.stringify(payload.videoMetrics.map((metric) => ({
          ...metricJson([metric])[0], youtube_video_id: metric.youtubeVideoId,
        })))],
      );
      if (savedMetrics.rowCount !== payload.videoMetrics.length) throw new Error("A video metric has no matching video");
    }

    await client.query("update public.channels set last_synced_at = now() where id = $1 and owner_id = $2", [channelId, ownerId]);
    const finished = await client.query(
      `update private.analytics_sync_jobs
          set status = 'succeeded', error_code = null, finished_at = now()
        where id = $1 and channel_id = $2 and status = 'running'`,
      [jobId, channelId],
    );
    if (!finished.rowCount) throw new Error("Sync job is no longer running");
  });
}

export async function failSyncJob(channelId: string, jobId: string, errorCode: string) {
  await database().query(
    `update private.analytics_sync_jobs
        set status = 'failed', error_code = $3, finished_at = now()
      where id = $1 and channel_id = $2 and status = 'running'`,
    [jobId, channelId, errorCode],
  );
}
