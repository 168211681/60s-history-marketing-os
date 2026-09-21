import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
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

export const runtime = "nodejs";
export const maxDuration = 60;

function redirect(origin: string, status: string) {
  const response = NextResponse.redirect(new URL(`/settings?youtube=${status}`, origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const user = await currentOwner();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Connection is not configured", { status: 503 });

  let connection: Awaited<ReturnType<typeof connectionForOwner>>;
  try {
    connection = await connectionForOwner(user.id);
  } catch {
    return redirect(origin, "sync-failed");
  }
  if (!connection) return new Response("YouTube channel is not connected", { status: 409 });

  const period = defaultSyncPeriod();
  let job: Awaited<ReturnType<typeof beginSyncJob>>;
  try {
    job = await beginSyncJob(connection.channel_id, period);
  } catch {
    return redirect(origin, "sync-failed");
  }
  if (job.kind === "existing") return redirect(origin, job.status === "running" ? "sync-running" : "sync-current");

  try {
    const accessToken = await accessTokenForOwner(user.id);
    if (!accessToken) throw new YouTubeSyncError("AUTH", "YouTube connection is missing");
    const videoIds = await fetchUploadVideoIds(accessToken, connection.youtube_channel_id);
    const videos = await fetchVideoMetadata(accessToken, connection.youtube_channel_id, videoIds);
    const analytics = await fetchAnalytics(accessToken, period, videos.map((video) => video.youtubeVideoId));
    await completeSyncJob(user.id, connection.channel_id, job.jobId, { videos, ...analytics });
    return redirect(origin, "sync-succeeded");
  } catch (error) {
    const code = error instanceof YouTubeSyncError ? error.code : "SYNC_FAILED";
    try {
      await failSyncJob(connection.channel_id, job.jobId, code);
    } catch {
      // The response remains generic; a stale running job can be reclaimed after 15 minutes.
    }
    return redirect(origin, "sync-failed");
  }
}
