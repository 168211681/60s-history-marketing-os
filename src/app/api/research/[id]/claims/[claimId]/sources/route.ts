import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/database";
import { researchProjectForOwner } from "@/lib/research/data";
import { privateHeaders, researchRequest } from "@/lib/research/http";

const schema = z.object({ sourceId: z.uuid(), relationship: z.enum(["supports", "contradicts", "contextualizes"]) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; claimId: string }> }) {
  const access = await researchRequest(request, true);
  if (access.error) return access.error;
  const { id, claimId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(claimId).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid source link" }, { status: 400 });
  const project = await researchProjectForOwner(id, access.ownerId!);
  if (!project || !project.claims.some((claim) => claim.id === claimId) || !project.sources.some((source) => source.id === parsed.data.sourceId)) {
    return NextResponse.json({ error: "Claim or source not found" }, { status: 404 });
  }
  if (["approved", "rejected"].includes(project.status)) return NextResponse.json({ error: "Reviewed project is locked" }, { status: 409 });
  const result = await database().query<{ claim_id: string }>(
    `insert into public.research_claim_sources (research_project_id,claim_id,source_id,relationship)
     select r.id,$2,$3,$4 from public.research_projects r join public.channels c on c.id=r.channel_id and c.owner_id=$5
     where r.id=$1 and r.status not in ('approved','rejected')
     on conflict (claim_id,source_id) do nothing returning claim_id`,
    [id, claimId, parsed.data.sourceId, parsed.data.relationship, access.ownerId]);
  if (!result.rows[0]) return NextResponse.json({ error: "Project changed or source is already linked" }, { status: 409 });
  return NextResponse.json({ claimId }, { status: 201, headers: privateHeaders });
}
