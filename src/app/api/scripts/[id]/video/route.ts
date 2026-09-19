import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";

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
    id: string; channel_id: string;
    status: "draft" | "reviewed" | "approved" | "archived";
  }>(
    `select d.id, d.channel_id, d.status
       from public.script_drafts d
       join public.channels c on c.id = d.channel_id and c.owner_id = $2
      where d.id = $1`,
    [id, user.id],
  );
  const row = draft.rows[0];
  if (!row) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (row.status !== "approved") return NextResponse.json({ error: "Only approved drafts can request video generation" }, { status: 409 });
  const workflow = await database().query<{ id: string; status: string; current_step: string }>(
    `insert into public.production_workflows (channel_id, script_draft_id)
     values ($1, $2)
     on conflict (script_draft_id, workflow_type) do update set updated_at = now()
     returning id, status, current_step`,
    [row.channel_id, row.id],
  );
  return NextResponse.json({ workflow: workflow.rows[0] }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}
