export interface VideoMetrics {
  id: string;
  title: string;
  topic: string;
  publishedAt: string;
  views: number;
  estimatedMinutesWatched: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
}

export function summarize(videos: readonly VideoMetrics[]) {
  const totals = videos.reduce(
    (sum, video) => ({
      views: sum.views + video.views,
      minutes: sum.minutes + video.estimatedMinutesWatched,
      gained: sum.gained + video.subscribersGained,
      lost: sum.lost + video.subscribersLost,
      likes: sum.likes + video.likes,
      comments: sum.comments + video.comments,
    }),
    { views: 0, minutes: 0, gained: 0, lost: 0, likes: 0, comments: 0 },
  );
  return {
    ...totals,
    watchHours: totals.minutes / 60,
    netSubscribers: totals.gained - totals.lost,
    averageViewSeconds:
      totals.views > 0 ? (totals.minutes * 60) / totals.views : null,
  };
}

export function topVideos(videos: readonly VideoMetrics[], limit = 3) {
  return [...videos]
    .sort((a, b) => b.views - a.views)
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
      if (sort === "views") return b.views - a.views;
      if (sort === "duration")
        return (
          (summarize([b]).averageViewSeconds ?? 0) -
          (summarize([a]).averageViewSeconds ?? 0)
        );
      return b.publishedAt.localeCompare(a.publishedAt);
    });
}

export const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
export const formatDuration = (seconds: number | null) =>
  seconds === null ? "No data" : `${Math.round(seconds)}s`;
