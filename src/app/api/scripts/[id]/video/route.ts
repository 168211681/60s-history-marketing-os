import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";
import { higgsfieldProvider } from "@/lib/video/higgsfield";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const user = await currentOwner();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });

  const draft = await database().query<{
    id: string; channel_id: string; title: string; hook: string; script_body: string;
    scene_cues: string; caption_text: string;
    status: "draft" | "reviewed" | "approved" | "archived";
  }>(
    `select d.id, d.channel_id, d.title, d.hook, d.script_body, d.scene_cues, d.caption_text, d.status
       from public.script_drafts d
       join public.channels c on c.id = d.channel_id and c.owner_id = $2
      where d.id = $1`,
    [id, user.id],
  );
  const row = draft.rows[0];
  if (!row) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (row.status !== "approved") return NextResponse.json({ error: "Only approved drafts can request video generation" }, { status: 409 });

  const provider = higgsfieldProvider();
  if (!provider.configured) return NextResponse.json({ error: "Higgsfield provider is not configured" }, { status: 503 });
  try {
    const job = await provider.submit({ draftId: row.id, title: row.title, hook: row.hook, scriptBody: row.script_body, sceneCues: row.scene_cues, captionText: row.caption_text });
    const saved = await database().query<{ id: string; status: string; external_job_id: string }>(
      `insert into public.video_generation_jobs (channel_id, script_draft_id, provider, status, external_job_id)
       values ($1, $2, 'higgsfield', 'queued', $3)
       returning id, status, external_job_id`,
      [row.channel_id, row.id, job.externalJobId],
    );
    return NextResponse.json({ job: saved.rows[0] }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PROVIDER_FAILED";
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
