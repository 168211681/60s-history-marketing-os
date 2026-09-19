import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";
import { publishVideo } from "@/lib/youtube/google";
import { accessTokenForOwner } from "@/lib/youtube/store";
import { recordWorkflowEvent } from "@/lib/workflows/events";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 });

  const workflow = await database().query<{ id: string; channel_id: string; youtube_video_id: string | null; status: string; attempts: number }>(
    `select w.id, w.channel_id, w.youtube_video_id, w.status, w.attempts
       from public.production_workflows w
       join public.channels c on c.id = w.channel_id and c.owner_id = $2
      where w.id = $1 and (w.status = 'published' or (w.status = 'uploaded_private' and w.current_step = 'awaiting_publish'))`,
    [id, owner.id],
  );
  const row = workflow.rows[0];
  if (!row || !row.youtube_video_id) return NextResponse.json({ error: "Only an uploaded private workflow can be published" }, { status: 409 });
  if (row.status === "published") return NextResponse.json({ status: "published", workflowId: row.id, youtubeVideoId: row.youtube_video_id });

  try {
    const accessToken = await accessTokenForOwner(owner.id);
    if (!accessToken) throw new Error("YOUTUBE_CONNECTION_MISSING");
    await publishVideo(accessToken, row.youtube_video_id);
    await database().query(
      `update public.production_workflows
          set status = 'published', current_step = 'published', error_code = null, updated_at = now()
        where id = $1 and channel_id = $2 and status = 'uploaded_private'`,
      [row.id, row.channel_id],
    );
    await recordWorkflowEvent({ workflowId: row.id, channelId: row.channel_id, attempt: row.attempts, eventType: "published", status: "published" });
    return NextResponse.json({ status: "published", workflowId: row.id, youtubeVideoId: row.youtube_video_id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "YOUTUBE_PUBLISH_FAILED";
    await database().query(
      `update public.production_workflows
          set error_code = $2, updated_at = now()
        where id = $1 and channel_id = $3 and status = 'uploaded_private'`,
      [row.id, code, row.channel_id],
    );
    await recordWorkflowEvent({ workflowId: row.id, channelId: row.channel_id, attempt: row.attempts, eventType: "failed", status: "uploaded_private", errorCode: code, metadata: { stage: "publish" } });
    return NextResponse.json({ status: "uploaded_private", workflowId: row.id, code }, { status: 502 });
  }
}
