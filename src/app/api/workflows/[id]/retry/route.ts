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
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 });

  const result = await database().query<{
    id: string;
    status: string;
    current_step: string;
  }>(
    `update public.production_workflows w
        set status = 'queued', current_step = 'awaiting_render', error_code = null, updated_at = now()
       from public.channels c
      where w.id = $1 and w.channel_id = c.id and c.owner_id = $2 and w.status = 'failed'
      returning w.id, w.status, w.current_step`,
    [id, owner.id],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Only an owned failed workflow can be retried" }, { status: 409 });
  return NextResponse.json({ workflow: result.rows[0] }, { headers: { "Cache-Control": "private, no-store" } });
}
