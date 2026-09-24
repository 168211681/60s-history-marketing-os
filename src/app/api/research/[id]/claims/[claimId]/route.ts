import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/database";
import { researchProjectForOwner } from "@/lib/research/data";
import { privateHeaders, researchRequest } from "@/lib/research/http";

const schema = z.object({
  verdict: z.enum(["supported", "disputed", "insufficient", "false", "contextual"]),
  confidence: z.enum(["low", "medium", "high"]),
  reviewerNote: z.string().trim().max(4000),
}).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; claimId: string }> }) {
  const access = await researchRequest(request, true);
  if (access.error) return access.error;
  const { id, claimId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(claimId).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid assessment" }, { status: 400 });
  const project = await researchProjectForOwner(id, access.ownerId!);
  if (!project || !project.claims.some((claim) => claim.id === claimId)) return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  if (["approved", "rejected"].includes(project.status)) return NextResponse.json({ error: "Reviewed project is locked" }, { status: 409 });
  const { verdict, confidence, reviewerNote } = parsed.data;
  if (verdict !== "insufficient" && !reviewerNote) return NextResponse.json({ error: "Reviewer note required" }, { status: 400 });
  if (verdict === "supported" && !project.claims.find((claim) => claim.id === claimId)!.sources.some((link) => link.relationship === "supports")) {
    return NextResponse.json({ error: "Supported claim requires a linked supporting source" }, { status: 409 });
  }
  const result = await database().query<{ id: string }>(
    `update public.research_claims cl set verdict=$4,confidence=$5,reviewer_note=$6
     from public.research_projects r join public.channels c on c.id=r.channel_id and c.owner_id=$3
     where cl.id=$1 and cl.research_project_id=$2 and r.id=cl.research_project_id
       and r.status not in ('approved','rejected') returning cl.id`,
    [claimId, id, access.ownerId, verdict, confidence, reviewerNote]);
  if (!result.rows[0]) return NextResponse.json({ error: "Project changed; reload before retrying" }, { status: 409 });
  return NextResponse.json({ id: claimId }, { headers: privateHeaders });
}
