import { formatDuration, formatNumber, summarize, type VideoMetrics } from "./analytics";

export type InsightKind = "observation" | "comparison" | "hypothesis" | "experiment";

export type MarketingInsight = {
  kind: InsightKind;
  title: string;
  detail: string;
};

type TopicGroup = {
  topic: string;
  videos: VideoMetrics[];
};

function topicGroups(videos: readonly VideoMetrics[]): TopicGroup[] {
  const groups = new Map<string, VideoMetrics[]>();
  for (const video of videos) {
    const existing = groups.get(video.topic) ?? [];
    existing.push(video);
    groups.set(video.topic, existing);
  }
  return [...groups.entries()]
    .map(([topic, groupedVideos]) => ({ topic, videos: groupedVideos }))
    .filter((group) => group.videos.length >= 2);
}

export function analyzeTopicPatterns(videos: readonly VideoMetrics[]): MarketingInsight[] {
  const baseline = summarize(videos);
  const groups = topicGroups(videos)
    .map((group) => ({ ...group, summary: summarize(group.videos) }))
    .filter((group) => group.summary.averageViewSeconds !== null && baseline.averageViewSeconds !== null)
    .sort((a, b) => (b.summary.averageViewSeconds ?? 0) - (a.summary.averageViewSeconds ?? 0));

  const best = groups[0];
  if (!best || baseline.averageViewSeconds === null) {
    return [{
      kind: "observation",
      title: "There is not enough grouped data yet",
      detail: "At least two videos in a topic and complete view-duration metrics are needed before comparing topic patterns.",
    }];
  }

  const difference = (best.summary.averageViewSeconds ?? 0) - baseline.averageViewSeconds;
  return [{
    kind: "observation",
    title: `${best.topic} has the highest grouped average view duration`,
    detail: `${best.videos.length} videos average ${formatDuration(best.summary.averageViewSeconds)} versus ${formatDuration(baseline.averageViewSeconds)} across the workspace.`,
  }, {
    kind: "comparison",
    title: `${difference >= 0 ? "Above" : "Below"} the workspace baseline by ${formatDuration(Math.abs(difference))}`,
    detail: `The comparison is weighted by views and describes association only; it does not establish why the topic performed differently.`,
  }];
}

export function generateContentRecommendations(videos: readonly VideoMetrics[]): MarketingInsight[] {
  const top = [...videos].sort((a, b) => (b.views ?? -1) - (a.views ?? -1))[0];
  if (!top) {
    return [{
      kind: "experiment",
      title: "Collect more videos before testing a pattern",
      detail: "A future experiment needs at least one comparable baseline and complete metrics.",
    }];
  }
  return [{
    kind: "hypothesis",
    title: "A stronger opening may contribute to attention",
    detail: `This is a testable hypothesis inspired by the top video (${formatNumber(top.views)} views), not a causal conclusion. Topic, timing, audience and distribution may also explain the result.`,
  }, {
    kind: "experiment",
    title: "Test two hook formats on comparable topics",
    detail: "Publish one question-led hook and one scene-led hook, then compare the same reporting window and record the context for each test.",
  }];
}

export function buildMarketingInsights(videos: readonly VideoMetrics[]): MarketingInsight[] {
  return [...analyzeTopicPatterns(videos), ...generateContentRecommendations(videos)];
}
