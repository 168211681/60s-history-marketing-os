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
