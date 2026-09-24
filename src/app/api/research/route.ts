import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/database";
import { researchProjectsForOwner } from "@/lib/research/data";
import { privateHeaders, researchRequest } from "@/lib/research/http";

const schema = z.object({
  topic: z.string().trim().min(1).max(200),
  researchQuestion: z.string().trim().max(2000).default(""),
  contentIdeaId: z.string().uuid().nullable().optional(),
  experimentId: z.string().uuid().nullable().optional(),
  scriptDraftId: z.string().uuid().nullable().optional(),
}).strict();

export async function GET(request: NextRequest) {
  const access = await researchRequest(request);
  if (access.error) return access.error;
  return NextResponse.json({ projects: await researchProjectsForOwner(access.ownerId!) }, { headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  const access = await researchRequest(request, true);
  if (access.error) return access.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid research project" }, { status: 400 });
  const ownerId = access.ownerId!;
  const channel = await database().query<{ id: string }>("select id from public.channels where owner_id=$1 limit 1", [ownerId]);
  if (!channel.rows[0]) return NextResponse.json({ error: "Connect a channel before researching" }, { status: 409 });
  const channelId = channel.rows[0].id;
  const links = await Promise.all([
    parsed.data.contentIdeaId ? database().query("select 1 from public.content_ideas where id=$1 and channel_id=$2", [parsed.data.contentIdeaId, channelId]) : null,
    parsed.data.experimentId ? database().query("select 1 from public.content_experiments where id=$1 and channel_id=$2", [parsed.data.experimentId, channelId]) : null,
    parsed.data.scriptDraftId ? database().query("select 1 from public.script_drafts where id=$1 and channel_id=$2", [parsed.data.scriptDraftId, channelId]) : null,
  ]);
  if (links.some((link) => link !== null && link.rowCount !== 1)) return NextResponse.json({ error: "Linked record not found" }, { status: 404 });
  let result;
  try {
    result = await database().query<{ id: string }>(
      `insert into public.research_projects (channel_id,content_idea_id,experiment_id,script_draft_id,topic,research_question)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [channelId, parsed.data.contentIdeaId ?? null, parsed.data.experimentId ?? null,
        parsed.data.scriptDraftId ?? null, parsed.data.topic, parsed.data.researchQuestion]);
  } catch (error) {
    if (["23503", "23505"].includes((error as { code?: string }).code ?? ""))
      return NextResponse.json({ error: "Linked record changed or is already assigned" }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ id: result.rows[0].id }, { status: 201, headers: privateHeaders });
}
