import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";

export const runtime = "nodejs";

const metric = z.number().finite().nonnegative().nullable().optional();
const bodySchema = z.object({
  status: z.enum(["running", "completed", "cancelled"]),
  resultSummary: z.string().trim().min(1).max(10000),
  recommendation: z.string().trim().min(1).max(5000),
  videoId: z.string().uuid().optional(),
  views: metric,
  minutesWatched: metric,
  averageViewDurationSeconds: metric,
  likes: metric,
  comments: metric,
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid experiment result" }, { status: 400 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid experiment id" }, { status: 400 });
  const input = parsed.data;
  const result = await database().query<{ id: string; status: string; result_summary: string; recommendation: string }>(
    `update public.content_experiments e
        set status = $2,
            result_summary = $3,
            recommendation = $4,
            video_id = coalesce($5::uuid, e.video_id),
            observed_views = $6,
            observed_minutes_watched = $7,
            observed_average_view_duration_seconds = $8,
            observed_likes = $9,
            observed_comments = $10,
            started_at = coalesce(e.started_at, case when $2 in ('running', 'completed') then now() else e.started_at end),
            completed_at = case when $2 = 'completed' then now() else null end,
            updated_at = now()
      from public.channels c
     where e.id = $1 and c.id = e.channel_id and c.owner_id = $11
       -- Results are an audit record; reviewed experiments cannot be rewritten.
       and e.status in ('planned', 'running')
       and ($5::uuid is null or exists (select 1 from public.videos v where v.id = $5 and v.channel_id = e.channel_id))
     returning e.id, e.status, e.result_summary, e.recommendation`,
    [id, input.status, input.resultSummary, input.recommendation, input.videoId ?? null, input.views ?? null, input.minutesWatched ?? null, input.averageViewDurationSeconds ?? null, input.likes ?? null, input.comments ?? null, owner.id],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Experiment not found or video is not owned" }, { status: 404 });
  return NextResponse.json({ experiment: result.rows[0] }, { headers: { "Cache-Control": "private, no-store" } });
}
