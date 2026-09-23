import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  hypothesis: z.string().trim().min(1).max(4000),
  hookFormat: z.string().trim().max(200).default(""),
  reportingWindowDays: z.union([z.literal(1), z.literal(7), z.literal(28)]),
  contentIdeaId: z.string().uuid().nullable().optional(),
  scriptDraftId: z.string().uuid().nullable().optional(),
  videoId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid experiment" }, { status: 400 });
  const channel = await database().query<{ id: string }>("select id from public.channels where owner_id = $1 limit 1", [owner.id]);
  if (!channel.rows[0]) return NextResponse.json({ error: "Connect YouTube before creating an experiment" }, { status: 409 });
  const { data } = parsed;
  const channelId = channel.rows[0].id;
  const links = await Promise.all([
    data.contentIdeaId ? database().query("select 1 from public.content_ideas where id=$1 and channel_id=$2", [data.contentIdeaId, channelId]) : null,
    data.scriptDraftId ? database().query("select 1 from public.script_drafts where id=$1 and channel_id=$2", [data.scriptDraftId, channelId]) : null,
    data.videoId ? database().query("select 1 from public.videos where id=$1 and channel_id=$2", [data.videoId, channelId]) : null,
  ]);
  if (links.some((result) => result !== null && result.rowCount !== 1)) {
    return NextResponse.json({ error: "Linked records must belong to the owner channel" }, { status: 404 });
  }
  const inserted = await database().query<{ id: string }>(
    `insert into public.content_experiments
      (channel_id, content_idea_id, script_draft_id, video_id, title, hypothesis, hook_format, reporting_window_days)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [channelId, data.contentIdeaId ?? null, data.scriptDraftId ?? null, data.videoId ?? null, data.title, data.hypothesis, data.hookFormat, data.reportingWindowDays],
  );
  return NextResponse.json({ id: inserted.rows[0].id }, { status: 201 });
}
