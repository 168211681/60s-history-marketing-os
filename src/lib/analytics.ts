export interface VideoMetrics {
  id: string;
  title: string;
  topic: string;
  publishedAt: string | null;
  views: number | null;
  estimatedMinutesWatched: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
  likes: number | null;
  comments: number | null;
}

export interface AnalyticsSummary {
  views: number | null;
  minutes: number | null;
  gained: number | null;
  lost: number | null;
  likes: number | null;
  comments: number | null;
  watchHours: number | null;
  netSubscribers: number | null;
  averageViewSeconds: number | null;
}

const optionalSum = (values: readonly (number | null)[]) => {
  if (!values.length || values.some((value) => value === null)) return null;
  return (values as readonly number[]).reduce((total, value) => total + value, 0);
};

export function summarize(videos: readonly VideoMetrics[]): AnalyticsSummary {
  const totals = {
    views: optionalSum(videos.map((video) => video.views)),
    minutes: optionalSum(videos.map((video) => video.estimatedMinutesWatched)),
    gained: optionalSum(videos.map((video) => video.subscribersGained)),
    lost: optionalSum(videos.map((video) => video.subscribersLost)),
    likes: optionalSum(videos.map((video) => video.likes)),
    comments: optionalSum(videos.map((video) => video.comments)),
  };
  return {
    ...totals,
    watchHours: totals.minutes === null ? null : totals.minutes / 60,
    netSubscribers: totals.gained === null || totals.lost === null ? null : totals.gained - totals.lost,
    averageViewSeconds:
      totals.views !== null && totals.minutes !== null && totals.views > 0
        ? (totals.minutes * 60) / totals.views
        : null,
  };
}

export function topVideos(videos: readonly VideoMetrics[], limit = 3) {
  return [...videos]
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    .slice(0, Math.max(0, limit));
}

export type VideoSort = "recent" | "views" | "duration";
export function selectVideos(
  videos: readonly VideoMetrics[],
  query: string,
  sort: VideoSort,
) {
  const search = query.trim().toLowerCase();
  return videos
    .filter((v) => `${v.title} ${v.topic}`.toLowerCase().includes(search))
    .sort((a, b) => {
      if (sort === "views") return (b.views ?? -1) - (a.views ?? -1);
      if (sort === "duration")
        return (
          (summarize([b]).averageViewSeconds ?? 0) -
          (summarize([a]).averageViewSeconds ?? 0)
        );
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    });
}

export const formatNumber = (value: number | null) => value === null
  ? "No data"
  : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
export const formatDate = (value: string | null) => value === null
  ? "Date unavailable"
  : new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
export const formatDuration = (seconds: number | null) =>
  seconds === null ? "No data" : `${Math.round(seconds)}s`;
