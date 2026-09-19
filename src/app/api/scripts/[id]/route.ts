import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";
import { canAdvanceScriptStatus, type ScriptStatus } from "@/lib/data/script-status";

export const runtime = "nodejs";

const bodySchema = z.object({ status: z.enum(["reviewed", "approved", "archived"]) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const user = await currentOwner();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });

  const current = await database().query<{ status: ScriptStatus }>(
    `select d.status from public.script_drafts d
     join public.channels c on c.id = d.channel_id and c.owner_id = $2
     where d.id = $1`,
    [id, user.id],
  );
  const row = current.rows[0];
  if (!row) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (!canAdvanceScriptStatus(row.status, parsed.data.status)) {
    return NextResponse.json({ error: `Cannot change ${row.status} to ${parsed.data.status}` }, { status: 409 });
  }
  const updated = await database().query<{ id: string; status: ScriptStatus; updated_at: string }>(
    `update public.script_drafts d set status = $2
     from public.channels c
     where d.id = $1 and c.id = d.channel_id and c.owner_id = $3
     returning d.id, d.status, d.updated_at`,
    [id, parsed.data.status, user.id],
  );
  return NextResponse.json({ draft: updated.rows[0] }, { headers: { "Cache-Control": "private, no-store" } });
}
