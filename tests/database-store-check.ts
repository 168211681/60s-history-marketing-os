import assert from "node:assert/strict";
import { Pool } from "pg";
import { beginSyncJob, completeSyncJob } from "../src/lib/youtube/store";
import { authenticatedAnalyticsReader } from "../src/lib/data/postgres-reader";

const ownerId = "10000000-0000-4000-8000-000000000001";
const channelId = "20000000-0000-4000-8000-000000000001";
const youtubeVideoId = "syncvideo01";
const period = { start: "2026-08-22", end: "2026-09-18" };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    const first = await beginSyncJob(channelId, period);
    assert.equal(first.kind, "started");
    if (first.kind !== "started") throw new Error("Expected a new sync job");
    assert.deepEqual(await beginSyncJob(channelId, period), { kind: "existing", status: "running" });

    await completeSyncJob(ownerId, channelId, first.jobId, {
      videos: [{ youtubeVideoId, title: "Synced video", publishedAt: "2026-09-18T10:00:00Z", durationSeconds: 58 }],
      channelMetrics: [{
        metricDate: "2026-09-18", views: "125", estimatedMinutesWatched: "40.5",
        averageViewDurationSeconds: "19.44", subscribersGained: "3", subscribersLost: "1", likes: "12", comments: "2",
      }],
      videoMetrics: [{
        youtubeVideoId, metricDate: "2026-09-18", views: "100", estimatedMinutesWatched: "30",
        averageViewDurationSeconds: "18", subscribersGained: "2", subscribersLost: "0", likes: "10", comments: "1",
      }],
    });
    assert.deepEqual(await beginSyncJob(channelId, period), { kind: "existing", status: "succeeded" });

    const result = await pool.query(
      `select j.status, c.last_synced_at is not null as synced, cm.views as channel_views,
            vm.views as video_views, v.duration_seconds
       from private.analytics_sync_jobs j
       join public.channels c on c.id = j.channel_id
       join public.channel_metrics cm on cm.channel_id = c.id and cm.metric_date = '2026-09-18'
       join public.videos v on v.channel_id = c.id and v.youtube_video_id = $1
       join public.video_metrics vm on vm.video_id = v.id and vm.metric_date = '2026-09-18'
      where j.id = $2`,
      [youtubeVideoId, first.jobId],
    );
    assert.deepEqual(result.rows, [{ status: "succeeded", synced: true, channel_views: "125", video_views: "100", duration_seconds: "58" }]);

    const reader = authenticatedAnalyticsReader(ownerId);
    assert.equal((await reader.listChannels())[0].id, channelId);
    assert.deepEqual(await reader.getLatestReportingPeriod(channelId), { from: period.start, through: period.end });
    const channelMetrics = await reader.getChannelMetrics(channelId, { from: period.start, through: period.end });
    assert.equal(channelMetrics.find((metric) => metric.metricDate === "2026-09-18")?.views, BigInt(125));
    const syncedVideo = (await reader.listVideos(channelId)).find((video) => video.youtubeVideoId === youtubeVideoId);
    assert.ok(syncedVideo);
    const allVideoMetrics = await reader.listVideoMetrics(channelId, { from: period.start, through: period.end });
    assert.equal(allVideoMetrics.find((metric) => metric.videoId === syncedVideo.id)?.views, BigInt(100));
    assert.equal((await reader.getVideoMetrics(channelId, syncedVideo.id, { from: period.start, through: period.end }))[0].views, BigInt(100));

    const foreignReader = authenticatedAnalyticsReader("10000000-0000-4000-8000-000000000002");
    assert.equal(await foreignReader.getChannel(channelId), null);
    assert.deepEqual(await foreignReader.listVideos(channelId), []);
  } finally {
    await pool.query("delete from private.analytics_sync_jobs where channel_id = $1 and idempotency_key = $2", [channelId, `youtube-daily-v1:${period.start}:${period.end}`]);
    await pool.query("delete from public.channel_metrics where channel_id = $1 and metric_date = '2026-09-18'", [channelId]);
    await pool.query("delete from public.videos where channel_id = $1 and youtube_video_id = $2", [channelId, youtubeVideoId]);
    await pool.query("update public.channels set last_synced_at = null where id = $1", [channelId]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
