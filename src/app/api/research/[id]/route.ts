import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/database";
import { researchProjectForOwner } from "@/lib/research/data";
import { canApproveResearch } from "@/lib/research/model";
import { privateHeaders, researchRequest } from "@/lib/research/http";

const schema = z.object({
  status: z.enum(["draft", "researching", "review", "approved", "rejected"]).optional(),
  summary: z.string().trim().max(10000).optional(),
  confidenceNote: z.string().trim().max(4000).optional(),
  researchQuestion: z.string().trim().max(2000).optional(),
  scriptDraftId: z.string().uuid().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const access = await researchRequest(request);
  if (access.error) return access.error;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  const item = await researchProjectForOwner(id, access.ownerId!);
  return item ? NextResponse.json({ project: item }, { headers: privateHeaders }) : NextResponse.json({ error: "Project not found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const access = await researchRequest(request, true);
  if (access.error) return access.error;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid research update" }, { status: 400 });
  const current = await researchProjectForOwner(id, access.ownerId!);
  if (!current) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (current.status === "approved" || current.status === "rejected") return NextResponse.json({ error: "Reviewed project is locked" }, { status: 409 });
  const next = parsed.data.status;
  const allowed: Record<string, string[]> = {
    draft: ["draft", "researching", "rejected"], researching: ["researching", "review", "rejected"],
    review: ["review", "researching", "approved", "rejected"], approved: [], rejected: [],
  };
  if (next && !allowed[current.status].includes(next)) return NextResponse.json({ error: "Invalid research status transition" }, { status: 409 });
  if (next === "approved" && !canApproveResearch(current)) return NextResponse.json({ error: "Review claims and sources before approval" }, { status: 409 });
  if (parsed.data.scriptDraftId) {
    const linked = await database().query("select 1 from public.script_drafts where id=$1 and channel_id=$2", [parsed.data.scriptDraftId, current.channelId]);
    if (linked.rowCount !== 1) return NextResponse.json({ error: "Linked draft not found" }, { status: 404 });
  }
  let result;
  try { result = await database().query<{ id: string; status: string }>(
    `update public.research_projects r set status=coalesce($3,r.status), summary=coalesce($4,r.summary),
      confidence_note=coalesce($5,r.confidence_note), research_question=coalesce($6,r.research_question),
      script_draft_id=case when $7 then $8 else r.script_draft_id end
     from public.channels c where r.id=$1 and c.id=r.channel_id and c.owner_id=$2 and r.status=$9
     returning r.id,r.status`,
    [id, access.ownerId, next ?? null, parsed.data.summary ?? null, parsed.data.confidenceNote ?? null,
      parsed.data.researchQuestion ?? null, Object.hasOwn(parsed.data, "scriptDraftId"), parsed.data.scriptDraftId ?? null, current.status]); }
  catch (error) {
    if (["23503", "23505"].includes((error as { code?: string }).code ?? ""))
      return NextResponse.json({ error: "Linked draft changed or is already assigned" }, { status: 409 });
    throw error;
  }
  if (!result.rows[0]) return NextResponse.json({ error: "Project changed; reload before retrying" }, { status: 409 });
  return NextResponse.json({ project: result.rows[0] }, { headers: privateHeaders });
}
