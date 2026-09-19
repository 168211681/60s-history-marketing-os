import { NextRequest, NextResponse } from "next/server";
import { ownerId } from "@/lib/auth/config";
import {
  accessTokenForOwner,
  beginSyncJob,
  completeSyncJob,
  connectionForOwner,
  databaseConfigured,
  failSyncJob,
} from "@/lib/youtube/store";
import {
  defaultSyncPeriod,
  fetchAnalytics,
  fetchUploadVideoIds,
  fetchVideoMetadata,
  YouTubeSyncError,
} from "@/lib/youtube/sync";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  return isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const owner = ownerId();
  if (!owner || !databaseConfigured()) return new Response("Sync is not configured", { status: 503 });

  const connection = await connectionForOwner(owner);
  if (!connection) return NextResponse.json({ status: "not-connected" }, { status: 409 });

  const period = defaultSyncPeriod();
  const job = await beginSyncJob(connection.channel_id, period);
  if (job.kind === "existing") return NextResponse.json({ status: job.status === "succeeded" ? "already-synced" : "running" });

  try {
    const accessToken = await accessTokenForOwner(owner);
    if (!accessToken) throw new YouTubeSyncError("AUTH", "YouTube connection is missing");
    const videoIds = await fetchUploadVideoIds(accessToken, connection.youtube_channel_id);
    const videos = await fetchVideoMetadata(accessToken, connection.youtube_channel_id, videoIds);
    const analytics = await fetchAnalytics(accessToken, period, videos.map((video) => video.youtubeVideoId));
    await completeSyncJob(owner, connection.channel_id, job.jobId, { videos, ...analytics });
    return NextResponse.json({ status: "succeeded", period });
  } catch (error) {
    const code = error instanceof YouTubeSyncError ? error.code : "SYNC_FAILED";
    await failSyncJob(connection.channel_id, job.jobId, code);
    return NextResponse.json({ status: "failed", code }, { status: 502 });
  }
}
