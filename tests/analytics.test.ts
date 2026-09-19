import test from "node:test";
import assert from "node:assert/strict";
import {
  selectVideos,
  summarize,
  topVideos,
  type VideoMetrics,
} from "../src/lib/analytics";
import { sampleVideos, sampleWeeklyViews } from "../src/lib/sample-data";
const video = (overrides: Partial<VideoMetrics>): VideoMetrics => ({
  id: "test",
  title: "Example",
  topic: "History",
  publishedAt: "2026-09-01",
  views: 0,
  estimatedMinutesWatched: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  likes: 0,
  comments: 0,
  ...overrides,
});
test("duration is weighted by views and minutes convert to hours", () => {
  const totals = summarize([
    video({ views: 100, estimatedMinutesWatched: 50 }),
    video({ views: 900, estimatedMinutesWatched: 900 }),
  ]);
  assert.equal(totals.views, 1000);
  assert.equal(totals.watchHours, 950 / 60);
  assert.equal(totals.averageViewSeconds, 57);
});
test("empty and zero-view datasets have no invented duration", () => {
  assert.equal(summarize([]).averageViewSeconds, null);
  assert.equal(summarize([video({})]).averageViewSeconds, null);
  assert.equal(summarize([]).views, null);
  assert.deepEqual(topVideos([]), []);
});
test("missing metrics remain unavailable instead of becoming zero", () => {
  const totals = summarize([video({
    views: null,
    estimatedMinutesWatched: null,
    subscribersGained: null,
    subscribersLost: null,
    likes: null,
    comments: null,
  })]);
  assert.equal(totals.views, null);
  assert.equal(totals.watchHours, null);
  assert.equal(totals.netSubscribers, null);
  assert.equal(summarize([video({ views: 10 }), video({ views: null })]).views, null);
});
test("subscriber growth includes net declines", () => {
  assert.equal(
    summarize([video({ subscribersGained: 2, subscribersLost: 5 })])
      .netSubscribers,
    -3,
  );
});
test("ranking preserves input order and respects limit", () => {
  const original = [
    video({ id: "low", views: 1 }),
    video({ id: "high", views: 99 }),
  ];
  assert.equal(topVideos(original, 1)[0].id, "high");
  assert.equal(original[0].id, "low");
  assert.deepEqual(topVideos(original, 0), []);
});
test("search matches titles/topics, normalizes input and supports empty results", () => {
  assert.equal(selectVideos(sampleVideos, "  WARFARE ", "views").length, 2);
  assert.equal(selectVideos(sampleVideos, "Roman", "recent")[0].id, "sample-2");
  assert.deepEqual(selectVideos(sampleVideos, "no-such-title", "recent"), []);
  assert.equal(selectVideos(sampleVideos, "", "recent")[0].id, "sample-1");
  assert.equal(selectVideos(sampleVideos, "", "duration")[0].id, "sample-2");
});
test("weekly chart reconciles with dashboard and video totals", () => {
  assert.equal(
    sampleWeeklyViews.reduce((total, week) => total + week.views, 0),
    summarize(sampleVideos).views,
  );
  assert.equal(
    new Set(sampleVideos.map((v) => v.id)).size,
    sampleVideos.length,
  );
});
