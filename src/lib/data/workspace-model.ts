import type { AnalyticsSummary, VideoMetrics } from "@/lib/analytics";
import type {
  ChannelDailyMetric,
  ChannelRecord,
  ReportingPeriod,
  VideoDailyMetric,
  VideoRecord,
} from "./analytics-contract";

export type WeeklyViews = { label: string; views: number | null };
export type WorkspaceData = {
  source: "sample" | "live";
  channelTitle: string;
  period: string;
  videos: readonly VideoMetrics[];
  summary: AnalyticsSummary;
  weeklyViews: readonly WeeklyViews[];
  lastSyncedAt: string | null;
  notice?: string;
};

function exactNumber(value: bigint | string | null) {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER) {
    throw new Error("Metric exceeds the safe UI number range");
  }
  return number;
}

function completeSum(values: readonly (number | null)[]) {
  if (!values.length || values.some((value) => value === null)) return null;
  return (values as readonly number[]).reduce((sum, value) => sum + value, 0);
}

function summarizeDaily(rows: readonly (ChannelDailyMetric | VideoDailyMetric)[]): AnalyticsSummary {
  const views = completeSum(rows.map((row) => exactNumber(row.views)));
  const minutes = completeSum(rows.map((row) => exactNumber(row.estimatedMinutesWatched)));
  const gained = completeSum(rows.map((row) => exactNumber(row.subscribersGained)));
  const lost = completeSum(rows.map((row) => exactNumber(row.subscribersLost)));
  const likes = completeSum(rows.map((row) => exactNumber(row.likes)));
  const comments = completeSum(rows.map((row) => exactNumber(row.comments)));
  return {
    views,
    minutes,
    gained,
    lost,
    likes,
    comments,
    watchHours: minutes === null ? null : minutes / 60,
    netSubscribers: gained === null || lost === null ? null : gained - lost,
    averageViewSeconds: views !== null && minutes !== null && views > 0 ? minutes * 60 / views : null,
  };
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function periodLabel(period: ReportingPeriod) {
  return `${shortDate.format(new Date(`${period.from}T00:00:00Z`))} – ${shortDate.format(new Date(`${period.through}T00:00:00Z`))}`;
}

function weeklyViews(rows: readonly ChannelDailyMetric[], period: ReportingPeriod): WeeklyViews[] {
  const start = new Date(`${period.from}T00:00:00Z`);
  return Array.from({ length: 4 }, (_, index) => {
    const from = new Date(start);
    from.setUTCDate(from.getUTCDate() + index * 7);
    const through = new Date(from);
    through.setUTCDate(through.getUTCDate() + 6);
    const fromKey = from.toISOString().slice(0, 10);
    const throughKey = through.toISOString().slice(0, 10);
    return {
      label: `${shortDate.format(from)}–${shortDate.format(through)}`,
      views: completeSum(rows.filter((row) => row.metricDate >= fromKey && row.metricDate <= throughKey).map((row) => exactNumber(row.views))),
    };
  });
}

export function buildLiveWorkspace(
  channel: ChannelRecord,
  reportingPeriod: ReportingPeriod,
  videos: readonly VideoRecord[],
  channelMetrics: readonly ChannelDailyMetric[],
  videoMetrics: readonly VideoDailyMetric[],
): WorkspaceData {
  const byVideo = new Map<string, VideoDailyMetric[]>();
  for (const metric of videoMetrics) {
    const existing = byVideo.get(metric.videoId) ?? [];
    existing.push(metric);
    byVideo.set(metric.videoId, existing);
  }
  const liveVideos = videos.map((video): VideoMetrics => {
    const summary = summarizeDaily(byVideo.get(video.id) ?? []);
    return {
      id: video.id,
      title: video.title,
      topic: video.topic ?? "Uncategorized",
      publishedAt: video.publishedAt,
      views: summary.views,
      estimatedMinutesWatched: summary.minutes,
      subscribersGained: summary.gained,
      subscribersLost: summary.lost,
      likes: summary.likes,
      comments: summary.comments,
    };
  });
  return {
    source: "live",
    channelTitle: channel.title,
    period: periodLabel(reportingPeriod),
    videos: liveVideos,
    summary: summarizeDaily(channelMetrics),
    weeklyViews: weeklyViews(channelMetrics, reportingPeriod),
    lastSyncedAt: channel.lastSyncedAt,
  };
}
