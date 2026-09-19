import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";

export type ScriptDraft = {
  id: string;
  title: string;
  hook: string;
  scriptBody: string;
  sceneCues: string;
  captionText: string;
  callToAction: string;
  researchNotes: string;
  status: "draft" | "reviewed" | "approved" | "archived";
  source: "codex_mcp" | "human";
  modelIdentifier: string | null;
  createdAt: string;
};

export async function scriptDraftsForOwner(): Promise<readonly ScriptDraft[]> {
  const owner = await currentOwner();
  if (!owner || !databaseConfigured()) return [];
  const result = await database().query<{
    id: string;
    title: string;
    hook: string;
    script_body: string;
    scene_cues: string;
    caption_text: string;
    call_to_action: string;
    research_notes: string;
    status: ScriptDraft["status"];
    source: ScriptDraft["source"];
    model_identifier: string | null;
    created_at: Date;
  }>(
    `select d.id, d.title, d.hook, d.script_body, d.scene_cues,
            d.caption_text, d.call_to_action, d.research_notes, d.status,
            d.source, d.model_identifier, d.created_at
       from public.script_drafts d
       join public.channels c on c.id = d.channel_id and c.owner_id = $1
      order by d.created_at desc
      limit 50`,
    [owner.id],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    hook: row.hook,
    scriptBody: row.script_body,
    sceneCues: row.scene_cues,
    captionText: row.caption_text,
    callToAction: row.call_to_action,
    researchNotes: row.research_notes,
    status: row.status,
    source: row.source,
    modelIdentifier: row.model_identifier,
    createdAt: row.created_at.toISOString(),
  }));
}

export type ProductionWorkflow = {
  id: string;
  scriptDraftId: string;
  title: string;
  status: string;
  currentStep: string;
  attempts: number;
  youtubeVideoId: string | null;
  errorCode: string | null;
  updatedAt: string;
};

export async function productionWorkflowsForOwner(): Promise<readonly ProductionWorkflow[]> {
  const owner = await currentOwner();
  if (!owner || !databaseConfigured()) return [];
  const result = await database().query<{
    id: string; script_draft_id: string; title: string; status: string;
    current_step: string; attempts: number; youtube_video_id: string | null; error_code: string | null; updated_at: Date;
  }>(
    `select w.id, w.script_draft_id, d.title, w.status, w.current_step, w.attempts,
            w.youtube_video_id, w.error_code, w.updated_at
       from public.production_workflows w
       join public.script_drafts d on d.id = w.script_draft_id
       join public.channels c on c.id = w.channel_id and c.owner_id = $1
      order by w.updated_at desc limit 20`,
    [owner.id],
  );
  return result.rows.map((row) => ({
    id: row.id, scriptDraftId: row.script_draft_id, title: row.title, status: row.status,
    currentStep: row.current_step, attempts: row.attempts, youtubeVideoId: row.youtube_video_id,
    errorCode: row.error_code, updatedAt: row.updated_at.toISOString(),
  }));
}
