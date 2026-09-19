import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";

export const runtime = "nodejs";

const eventSchema = z.object({
  id: z.string().uuid(),
  event_type: z.string().regex(/^[a-z_]{1,32}$/),
  status: z.string().regex(/^[a-z_]{1,32}$/),
  error_code: z.string().regex(/^[A-Z0-9_]{1,64}$/).nullable(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  created_at: z.coerce.date(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 });

  const result = await database().query(
    `select e.id, e.event_type, e.status, e.error_code, e.metadata, e.created_at
       from private.production_workflow_events e
       join public.production_workflows w on w.id = e.workflow_id
       join public.channels c on c.id = w.channel_id and c.owner_id = $2
      where e.workflow_id = $1
      order by e.created_at desc
      limit 100`,
    [id, owner.id],
  );
  const events = result.rows.flatMap((row) => {
    const parsed = eventSchema.safeParse(row);
    if (!parsed.success) return [];
    return [{
      id: parsed.data.id,
      eventType: parsed.data.event_type,
      status: parsed.data.status,
      errorCode: parsed.data.error_code,
      metadata: parsed.data.metadata,
      createdAt: parsed.data.created_at.toISOString(),
    }];
  });
  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}
