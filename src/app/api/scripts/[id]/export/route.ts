import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";
import { buildBriefPackage, exportAccessDecision, zipBriefPackage, type ExportDraft } from "@/lib/creative-brief-export";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = appOrigin();
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  const authDecision = exportAccessDecision({ authenticated: Boolean(owner), ownerMatch: Boolean(owner) });
  if (authDecision.status !== 200 || !owner) return NextResponse.json({ error: authDecision.error }, { status: authDecision.status });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  const result = await database().query<ExportDraft>(
    `select d.title, d.hook, d.script_body as "scriptBody", d.scene_cues as "sceneCues",
            d.caption_text as "captionText", d.call_to_action as "callToAction",
            d.research_notes as "researchNotes", d.status, d.created_at as "createdAt"
       from public.script_drafts d
       join public.channels c on c.id = d.channel_id and c.owner_id = $2
      where d.id = $1`, [id, owner.id],
  );
  const draft = result.rows[0];
  const decision = exportAccessDecision({ authenticated: true, ownerMatch: Boolean(draft), draftStatus: draft?.status });
  if (decision.status !== 200) return NextResponse.json({ error: decision.error }, { status: decision.status });
  let zip: Buffer;
  try {
    zip = zipBriefPackage(buildBriefPackage({ ...draft!, createdAt: new Date(draft!.createdAt).toISOString() }));
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 413 });
    throw error;
  }
  return new NextResponse(zip as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="creative-brief-${id}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "private, no-store",
    },
  });
}
