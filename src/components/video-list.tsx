import {
  formatDate,
  formatDuration,
  formatNumber,
  summarize,
  type VideoMetrics,
} from "@/lib/analytics";
import { EmptyState } from "./ui";

export function VideoList({ videos }: { videos: readonly VideoMetrics[] }) {
  if (!videos.length)
    return (
      <EmptyState title="No videos found">
        <p>Try another title or topic, or clear your search.</p>
      </EmptyState>
    );
  return (
    <ul className="video-list">
      {videos.map((video, index) => (
        <li key={video.id}>
          <div className={`video-art art-${index % 3}`} aria-hidden="true">
            <span>60s</span>
            <span>HISTORY</span>
          </div>
          <div className="video-info">
            <h3>{video.title}</h3>
            <p className="muted text-xs">
              {video.topic} · {formatDate(video.publishedAt)}
            </p>
          </div>
          <dl className="video-stat">
            <dt>Views</dt>
            <dd>{formatNumber(video.views)}</dd>
          </dl>
          <dl className="video-stat duration">
            <dt>Avg. duration</dt>
            <dd>{formatDuration(summarize([video]).averageViewSeconds)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
