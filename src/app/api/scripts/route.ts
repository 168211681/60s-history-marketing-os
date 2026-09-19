import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  hook: z.string().trim().min(1).max(2000),
  scriptBody: z.string().trim().min(1).max(20000),
});

export async function POST(request: NextRequest) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Title, hook, and script are required" }, { status: 400 });
  const channel = await database().query<{ id: string }>("select id from public.channels where owner_id = $1 limit 1", [owner.id]);
  if (!channel.rows[0]) return NextResponse.json({ error: "Connect YouTube before creating a draft" }, { status: 409 });
  const draft = await database().query<{ id: string }>(
    `insert into public.script_drafts (channel_id, title, hook, script_body, source, model_identifier)
     values ($1, $2, $3, $4, 'human', 'human') returning id`,
    [channel.rows[0].id, parsed.data.title, parsed.data.hook, parsed.data.scriptBody],
  );
  return NextResponse.json({ id: draft.rows[0].id }, { status: 201 });
}
