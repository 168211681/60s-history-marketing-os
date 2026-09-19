import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelDailyMetric, VideoDailyMetric } from "../src/lib/data/analytics-contract";
import { buildLiveWorkspace } from "../src/lib/data/workspace-model";

const channel = {
  id: "20000000-0000-4000-8000-000000000001",
  youtubeChannelId: "UC" + "a".repeat(22),
  title: "60s History",
  lastSyncedAt: "2026-09-19T00:00:00.000Z",
};
const period = { from: "2026-08-22", through: "2026-09-18" };
const metric = (overrides: Partial<ChannelDailyMetric> = {}): ChannelDailyMetric => ({
  channelId: channel.id,
  metricDate: "2026-08-22",
  collectedAt: "2026-09-19T00:00:00.000Z",
  views: BigInt(10),
  estimatedMinutesWatched: "5",
  averageViewDurationSeconds: "30",
  subscribersGained: BigInt(2),
  subscribersLost: BigInt(1),
  likes: BigInt(4),
  comments: BigInt(1),
  ...overrides,
});

test("live workspace keeps channel totals separate and groups four UTC weeks", () => {
  const videos = [{
    id: "30000000-0000-4000-8000-000000000001",
    channelId: channel.id,
    youtubeVideoId: "aaaaaaaaaaa",
    title: "Synced history",
    topic: null,
    publishedAt: "2026-09-18T10:00:00.000Z",
    durationSeconds: "58",
  }];
  const channelMetrics = [metric(), metric({ metricDate: "2026-08-23", views: BigInt(20), estimatedMinutesWatched: "15" })];
  const videoMetrics: VideoDailyMetric[] = [{ ...metric({ views: BigInt(12), estimatedMinutesWatched: "6" }), videoId: videos[0].id }];
  const result = buildLiveWorkspace(channel, period, videos, channelMetrics, videoMetrics);
  assert.equal(result.source, "live");
  assert.equal(result.summary.views, 30);
  assert.equal(result.summary.averageViewSeconds, 40);
  assert.equal(result.videos[0].views, 12);
  assert.equal(result.videos[0].topic, "Uncategorized");
  assert.deepEqual(result.weeklyViews.map((week) => week.views), [30, null, null, null]);
});

test("live workspace preserves unavailable metrics and rejects unsafe counts", () => {
  const result = buildLiveWorkspace(channel, period, [], [metric({ likes: null })], []);
  assert.equal(result.summary.likes, null);
  assert.throws(() => buildLiveWorkspace(channel, period, [], [metric({ views: BigInt("9007199254740992") })], []));
});
