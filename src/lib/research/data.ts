import { database } from "@/lib/database";
import type { ResearchClaim, ResearchProject, ResearchSource } from "./model";

type ProjectRow = {
  id: string; channel_id: string; content_idea_id: string | null; experiment_id: string | null;
  script_draft_id: string | null; topic: string; status: ResearchProject["status"];
  research_question: string; summary: string; confidence_note: string;
};

function project(row: ProjectRow): ResearchProject {
  return { id: row.id, channelId: row.channel_id, contentIdeaId: row.content_idea_id,
    experimentId: row.experiment_id, scriptDraftId: row.script_draft_id, topic: row.topic,
    status: row.status, researchQuestion: row.research_question, summary: row.summary,
    confidenceNote: row.confidence_note, sources: [], claims: [] };
}

export async function researchProjectsForOwner(ownerId: string) {
  const rows = await database().query<ProjectRow>(
    `select r.* from public.research_projects r
     join public.channels c on c.id=r.channel_id and c.owner_id=$1
     order by r.updated_at desc limit 50`, [ownerId]);
  return rows.rows.map(project);
}

export async function researchLinkOptionsForOwner(ownerId: string) {
  const [ideas, experiments, drafts] = await Promise.all([
    database().query<{ id: string; title: string }>(
      `select i.id,i.title from public.content_ideas i join public.channels c on c.id=i.channel_id and c.owner_id=$1 order by i.created_at desc limit 50`, [ownerId]),
    database().query<{ id: string; title: string | null }>(
      `select e.id,e.title from public.content_experiments e join public.channels c on c.id=e.channel_id and c.owner_id=$1 order by e.created_at desc limit 50`, [ownerId]),
    database().query<{ id: string; title: string }>(
      `select d.id,d.title from public.script_drafts d join public.channels c on c.id=d.channel_id and c.owner_id=$1 order by d.created_at desc limit 50`, [ownerId]),
  ]);
  return { ideas: ideas.rows, experiments: experiments.rows, drafts: drafts.rows };
}

export async function researchProjectForOwner(id: string, ownerId: string): Promise<ResearchProject | null> {
  const result = await database().query<ProjectRow>(
    `select r.* from public.research_projects r
     join public.channels c on c.id=r.channel_id and c.owner_id=$2 where r.id=$1`, [id, ownerId]);
  if (!result.rows[0]) return null;
  const item = project(result.rows[0]);
  const [sources, claims, links] = await Promise.all([
    database().query<{ id: string; source_type: string; title: string; publisher: string; author: string | null; published_at: Date | null; url: string | null; citation_text: string; notes: string; reliability_note: string }>(
      `select id, source_type, title, publisher, author, published_at, url, citation_text, notes, reliability_note
       from public.research_sources where research_project_id=$1 order by created_at`, [id]),
    database().query<{ id: string; claim_text: string; verdict: ResearchClaim["verdict"]; confidence: ResearchClaim["confidence"]; reviewer_note: string }>(
      `select id, claim_text, verdict, confidence, reviewer_note from public.research_claims
       where research_project_id=$1 order by created_at`, [id]),
    database().query<{ claim_id: string; source_id: string; relationship: "supports" | "contradicts" | "contextualizes" }>(
      `select claim_id, source_id, relationship from public.research_claim_sources where research_project_id=$1`, [id]),
  ]);
  item.sources = sources.rows.map((row): ResearchSource => ({ id: row.id, sourceType: row.source_type,
    title: row.title, publisher: row.publisher, author: row.author,
    publishedAt: row.published_at?.toISOString().slice(0, 10) ?? null, url: row.url,
    citationText: row.citation_text, notes: row.notes, reliabilityNote: row.reliability_note }));
  item.claims = claims.rows.map((row) => ({ id: row.id, claimText: row.claim_text, verdict: row.verdict,
    confidence: row.confidence, reviewerNote: row.reviewer_note,
    sources: links.rows.filter((link) => link.claim_id === row.id).map((link) => ({ sourceId: link.source_id, relationship: link.relationship })) }));
  return item;
}

export async function researchForScript(draftId: string, ownerId: string) {
  let result;
  try { result = await database().query<{ id: string }>(
    `select r.id from public.research_projects r
     join public.channels c on c.id=r.channel_id and c.owner_id=$2
     join public.script_drafts d on d.id=r.script_draft_id and d.channel_id=r.channel_id
     where d.id=$1 limit 1`, [draftId, ownerId]); }
  catch (error) {
    // An existing approved draft remains exportable during a staged schema rollout.
    if ((error as { code?: string }).code === "42P01") return null;
    throw error;
  }
  return result.rows[0] ? researchProjectForOwner(result.rows[0].id, ownerId) : null;
}

export async function researchEvidenceForOwner(ownerId: string) {
  try {
    const rows = await database().query<{ id: string; script_draft_id: string; status: ResearchProject["status"]; source_count: number; claim_count: number; unresolved_count: number }>(
      `select r.id,r.script_draft_id,r.status,
         (select count(*)::int from public.research_sources s where s.research_project_id=r.id) source_count,
         (select count(*)::int from public.research_claims cl where cl.research_project_id=r.id) claim_count,
         (select count(*)::int from public.research_claims cl where cl.research_project_id=r.id and cl.verdict not in ('supported','contextual')) unresolved_count
       from public.research_projects r join public.channels c on c.id=r.channel_id and c.owner_id=$1
       where r.script_draft_id is not null`, [ownerId]);
    return new Map(rows.rows.map((row) => [row.script_draft_id, {
      id: row.id,
      evidenceStatus: row.status !== "approved" ? "research_in_progress" :
        row.source_count > 0 && row.claim_count > 0 && row.unresolved_count === 0 ? "reviewed" : "insufficient_evidence",
    }]));
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return new Map<string, { id: string; evidenceStatus: string }>();
    throw error;
  }
}
