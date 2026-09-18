/**
 * Server-side contract for the future authenticated analytics adapter.
 * No implementation is exported until owner sign-in and token handling exist.
 * Methods must derive channel access from the verified session used to create
 * the adapter. A channel ID supplied by a caller is never authorization.
 */

export type MetricDate = string; // YYYY-MM-DD as reported by the source API.
export type DecimalValue = string; // Exact PostgreSQL numeric; never a float guess.

export interface ReportingPeriod {
  from: MetricDate;
  through: MetricDate;
}

export interface ChannelRecord {
  id: string;
  youtubeChannelId: string;
  title: string;
  lastSyncedAt: string | null;
}

export interface VideoRecord {
  id: string;
  channelId: string;
  youtubeVideoId: string;
  title: string;
  topic: string | null;
  publishedAt: string | null;
  durationSeconds: DecimalValue | null;
}

export interface DailyMetricValues {
  /** NULL means the API did not provide this metric, not zero. */
  views: bigint | null;
  estimatedMinutesWatched: DecimalValue | null;
  averageViewDurationSeconds: DecimalValue | null;
  subscribersGained: bigint | null;
  subscribersLost: bigint | null;
  likes: bigint | null;
  comments: bigint | null;
}

export interface ChannelDailyMetric extends DailyMetricValues {
  channelId: string;
  metricDate: MetricDate;
  collectedAt: string;
}

export interface VideoDailyMetric extends DailyMetricValues {
  channelId: string;
  videoId: string;
  metricDate: MetricDate;
  collectedAt: string;
}

export interface AuthenticatedAnalyticsReader {
  /** Return only channels belonging to the verified session owner. */
  listChannels(): Promise<readonly ChannelRecord[]>;
  /** Return null when the channel is missing or not owned by this session. */
  getChannel(channelId: string): Promise<ChannelRecord | null>;
  listVideos(channelId: string): Promise<readonly VideoRecord[]>;
  getChannelMetrics(
    channelId: string,
    period: ReportingPeriod,
  ): Promise<readonly ChannelDailyMetric[]>;
  getVideoMetrics(
    channelId: string,
    videoId: string,
    period: ReportingPeriod,
  ): Promise<readonly VideoDailyMetric[]>;
}
