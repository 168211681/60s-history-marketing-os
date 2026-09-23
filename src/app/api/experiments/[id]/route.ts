import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";
import { experimentsForOwner } from "@/lib/data/experiments";

const schema = z.object({ status: z.enum(["running", "completed", "cancelled"]) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid experiment id" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid experiment status" }, { status: 400 });
  const current = await database().query<{ status: string; video_id: string | null; video_published_at: Date | null; reporting_window_days: number }>(
    `select e.status, e.video_id, v.published_at as video_published_at, e.reporting_window_days
       from public.content_experiments e join public.channels c on c.id=e.channel_id and c.owner_id=$2
       left join public.videos v on v.id=e.video_id and v.channel_id=e.channel_id where e.id=$1`, [id, owner.id]);
  const row = current.rows[0];
  if (!row) return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  if (parsed.data.status === "running" && (!row.video_id || !row.video_published_at)) return NextResponse.json({ error: "A published video is required before running an experiment" }, { status: 409 });
  if (parsed.data.status === "completed") {
    if (!row.video_id || !row.video_published_at) return NextResponse.json({ error: "A published video is required before completion" }, { status: 409 });
    const experiment = (await experimentsForOwner()).find((item) => item.id === id);
    if (!experiment || experiment.evaluation.evidence !== "sufficient") {
      return NextResponse.json({ error: "Comparable evidence is required before completion" }, { status: 409 });
    }
  }
  if (row.status === "completed" || row.status === "cancelled") return NextResponse.json({ error: "Completed or cancelled experiments cannot be changed" }, { status: 409 });
  const updated = await database().query<{ id: string; status: string }>(
    `update public.content_experiments e set status=$2, started_at=case when $2='running' then coalesce(e.started_at, now()) else e.started_at end,
       completed_at=case when $2='completed' then now() else null end
      from public.channels c where e.id=$1 and c.id=e.channel_id and c.owner_id=$3 returning e.id,e.status`, [id, parsed.data.status, owner.id]);
  return NextResponse.json({ experiment: updated.rows[0] }, { headers: { "Cache-Control": "private, no-store" } });
}
