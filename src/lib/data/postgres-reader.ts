import { database } from "@/lib/database";
import type {
  AuthenticatedAnalyticsReader,
  ChannelDailyMetric,
  ChannelRecord,
  ReportingPeriod,
  VideoDailyMetric,
  VideoRecord,
} from "./analytics-contract";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function uuid(value: string) {
  if (!uuidPattern.test(value)) throw new Error("Invalid database identifier");
  return value;
}

function period(value: ReportingPeriod) {
  if (!datePattern.test(value.from) || !datePattern.test(value.through) || value.from > value.through) {
    throw new Error("Invalid reporting period");
  }
  return value;
}

function iso(value: Date | string | null) {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid database timestamp");
  return date.toISOString();
}

function dateOnly(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (!datePattern.test(value)) throw new Error("Invalid database date");
  return value;
}

function count(value: string | null) {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw new Error("Invalid database count");
  return BigInt(value);
}

type ChannelRow = {
  id: string;
  youtube_channel_id: string;
  title: string;
  last_synced_at: Date | string | null;
};
type VideoRow = {
  id: string;
  channel_id: string;
  youtube_video_id: string;
  title: string;
  topic: string | null;
  published_at: Date | string | null;
  duration_seconds: string | null;
};
type MetricRow = {
  channel_id: string;
  video_id?: string;
  metric_date: Date | string;
  views: string | null;
  estimated_minutes_watched: string | null;
  average_view_duration_seconds: string | null;
  subscribers_gained: string | null;
  subscribers_lost: string | null;
  likes: string | null;
  comments: string | null;
  collected_at: Date | string;
};

function channelRecord(row: ChannelRow): ChannelRecord {
  return {
    id: row.id,
    youtubeChannelId: row.youtube_channel_id,
    title: row.title,
    lastSyncedAt: iso(row.last_synced_at),
  };
}

function videoRecord(row: VideoRow): VideoRecord {
  return {
    id: row.id,
    channelId: row.channel_id,
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    topic: row.topic,
    publishedAt: iso(row.published_at),
    durationSeconds: row.duration_seconds,
  };
}

function metricValues(row: MetricRow) {
  return {
    views: count(row.views),
    estimatedMinutesWatched: row.estimated_minutes_watched,
    averageViewDurationSeconds: row.average_view_duration_seconds,
    subscribersGained: count(row.subscribers_gained),
    subscribersLost: count(row.subscribers_lost),
    likes: count(row.likes),
    comments: count(row.comments),
  };
}

function channelMetric(row: MetricRow): ChannelDailyMetric {
  return {
    channelId: row.channel_id,
    metricDate: dateOnly(row.metric_date),
    collectedAt: iso(row.collected_at)!,
    ...metricValues(row),
  };
}

function videoMetric(row: MetricRow): VideoDailyMetric {
  if (!row.video_id) throw new Error("Video metric is missing its video");
  return {
    channelId: row.channel_id,
    videoId: row.video_id,
    metricDate: dateOnly(row.metric_date),
    collectedAt: iso(row.collected_at)!,
    ...metricValues(row),
  };
}

const metricColumns = `channel_id, metric_date, views, estimated_minutes_watched,
  average_view_duration_seconds, subscribers_gained, subscribers_lost, likes,
  comments, collected_at`;

export function authenticatedAnalyticsReader(ownerId: string): AuthenticatedAnalyticsReader {
  const owner = uuid(ownerId);
  return {
    async listChannels() {
      const result = await database().query<ChannelRow>(
        `select id, youtube_channel_id, title, last_synced_at
           from public.channels where owner_id = $1 order by created_at`,
        [owner],
      );
      return result.rows.map(channelRecord);
    },
    async getChannel(channelId) {
      const result = await database().query<ChannelRow>(
        `select id, youtube_channel_id, title, last_synced_at
           from public.channels where id = $1 and owner_id = $2`,
        [uuid(channelId), owner],
      );
      return result.rows[0] ? channelRecord(result.rows[0]) : null;
    },
    async getLatestReportingPeriod(channelId) {
      const result = await database().query<{ period_start: Date | string; period_end: Date | string }>(
        `select j.period_start, j.period_end
           from private.analytics_sync_jobs j
           join public.channels c on c.id = j.channel_id and c.owner_id = $2
          where j.channel_id = $1 and j.status = 'succeeded'
          order by j.period_end desc, j.finished_at desc limit 1`,
        [uuid(channelId), owner],
      );
      const row = result.rows[0];
      return row ? { from: dateOnly(row.period_start), through: dateOnly(row.period_end) } : null;
    },
    async listVideos(channelId) {
      const result = await database().query<VideoRow>(
        `select v.id, v.channel_id, v.youtube_video_id, v.title, v.topic,
                v.published_at, v.duration_seconds
           from public.videos v
           join public.channels c on c.id = v.channel_id and c.owner_id = $2
          where v.channel_id = $1 order by v.published_at desc nulls last, v.id`,
        [uuid(channelId), owner],
      );
      return result.rows.map(videoRecord);
    },
    async getChannelMetrics(channelId, reportingPeriod) {
      const range = period(reportingPeriod);
      const result = await database().query<MetricRow>(
        `select ${metricColumns}
           from public.channel_metrics m
           join public.channels c on c.id = m.channel_id and c.owner_id = $4
          where m.channel_id = $1 and m.metric_date between $2 and $3
          order by m.metric_date`,
        [uuid(channelId), range.from, range.through, owner],
      );
      return result.rows.map(channelMetric);
    },
    async getVideoMetrics(channelId, videoId, reportingPeriod) {
      const range = period(reportingPeriod);
      const result = await database().query<MetricRow>(
        `select m.video_id, ${metricColumns.replace("channel_id", "m.channel_id")}
           from public.video_metrics m
           join public.channels c on c.id = m.channel_id and c.owner_id = $5
          where m.channel_id = $1 and m.video_id = $2
            and m.metric_date between $3 and $4 order by m.metric_date`,
        [uuid(channelId), uuid(videoId), range.from, range.through, owner],
      );
      return result.rows.map(videoMetric);
    },
    async listVideoMetrics(channelId, reportingPeriod) {
      const range = period(reportingPeriod);
      const result = await database().query<MetricRow>(
        `select m.video_id, ${metricColumns.replace("channel_id", "m.channel_id")}
           from public.video_metrics m
           join public.channels c on c.id = m.channel_id and c.owner_id = $4
          where m.channel_id = $1 and m.metric_date between $2 and $3
          order by m.metric_date, m.video_id`,
        [uuid(channelId), range.from, range.through, owner],
      );
      return result.rows.map(videoMetric);
    },
  };
}
