import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/database";
import { researchProjectForOwner } from "@/lib/research/data";
import { privateHeaders, researchRequest } from "@/lib/research/http";

const schema = z.object({ claimText: z.string().trim().min(1).max(4000) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await researchRequest(request, true);
  if (access.error) return access.error;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid claim" }, { status: 400 });
  const project = await researchProjectForOwner(id, access.ownerId!);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["approved", "rejected"].includes(project.status)) return NextResponse.json({ error: "Reviewed project is locked" }, { status: 409 });
  const result = await database().query<{ id: string }>(
    `insert into public.research_claims (research_project_id,claim_text)
     select r.id,$3 from public.research_projects r join public.channels c on c.id=r.channel_id and c.owner_id=$2
     where r.id=$1 and r.status not in ('approved','rejected') returning id`, [id, access.ownerId, parsed.data.claimText]);
  if (!result.rows[0]) return NextResponse.json({ error: "Project changed; reload before retrying" }, { status: 409 });
  return NextResponse.json({ id: result.rows[0].id }, { status: 201, headers: privateHeaders });
}
