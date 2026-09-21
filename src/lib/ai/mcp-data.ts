import { database } from "@/lib/database";
import { ownerId } from "@/lib/auth/config";
import { buildMarketingInsights } from "@/lib/insights";
import { authenticatedAnalyticsReader } from "@/lib/data/postgres-reader";
import { buildLiveWorkspace, type WorkspaceData } from "@/lib/data/workspace-model";

export type OwnerContext = {
  ownerId: string;
  channelId: string;
  channelTitle: string;
  period: { from: string; through: string };
  workspace: WorkspaceData;
};

export async function ownerContext(): Promise<OwnerContext> {
  const owner = ownerId();
  if (!owner) throw new Error("OWNER_USER_ID is not configured");
  const reader = authenticatedAnalyticsReader(owner);
  const channel = (await reader.listChannels())[0];
  if (!channel) throw new Error("No YouTube channel is connected");
  const period = await reader.getLatestReportingPeriod(channel.id);
  if (!period) throw new Error("No completed analytics sync is available");
  const [videos, channelMetrics, videoMetrics] = await Promise.all([
    reader.listVideos(channel.id),
    reader.getChannelMetrics(channel.id, period),
    reader.listVideoMetrics(channel.id, period),
  ]);
  return {
    ownerId: owner,
    channelId: channel.id,
    channelTitle: channel.title,
    period,
    workspace: buildLiveWorkspace(channel, period, videos, channelMetrics, videoMetrics),
  };
}

export async function saveContentIdea(context: OwnerContext, title: string, angle: string) {
  const result = await database().query<{ id: string; title: string; angle: string; status: string }>(
    `insert into public.content_ideas (channel_id, title, angle, status)
     values ($1, $2, $3, 'draft')
     returning id, title, angle, status`,
    [context.channelId, title.trim(), angle.trim()],
  );
  return result.rows[0];
}

export async function saveAiInsight(
  context: OwnerContext,
  kind: "hypothesis" | "experiment",
  content: string,
  evidenceSummary: string,
  modelIdentifier: string,
) {
  const result = await database().query<{
    id: string;
    kind: string;
    content: string;
    evidence_summary: string;
    period_start: string;
    period_end: string;
  }>(
    `insert into public.marketing_insights
       (channel_id, kind, origin, content, evidence_summary, period_start, period_end, model_identifier)
     values ($1, $2, 'ai', $3, $4, $5, $6, $7)
     returning id, kind, content, evidence_summary, period_start, period_end`,
    [context.channelId, kind, content.trim(), evidenceSummary.trim(), context.period.from, context.period.through, modelIdentifier.trim()],
  );
  return result.rows[0];
}

export async function saveScriptDraft(
  context: OwnerContext,
  input: {
    title: string;
    hook: string;
    scriptBody: string;
    sceneCues: string;
    captionText: string;
    callToAction: string;
    researchNotes: string;
    contentIdeaId?: string;
    modelIdentifier?: string;
    source?: "codex_mcp" | "ai_provider" | "human";
  },
) {
  if (input.contentIdeaId) {
    const idea = await database().query<{ id: string }>(
      `select i.id from public.content_ideas i
       where i.id = $1 and i.channel_id = $2`,
      [input.contentIdeaId, context.channelId],
    );
    if (!idea.rowCount) throw new Error("contentIdeaId is not owned by the connected channel");
  }
  const result = await database().query<{ id: string; title: string; status: string; created_at: string }>(
    `insert into public.script_drafts
       (channel_id, content_idea_id, title, hook, script_body, scene_cues, caption_text,
        call_to_action, research_notes, source, model_identifier)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id, title, status, created_at`,
    [
      context.channelId,
      input.contentIdeaId ?? null,
      input.title.trim(),
      input.hook.trim(),
      input.scriptBody.trim(),
      input.sceneCues.trim(),
      input.captionText.trim(),
      input.callToAction.trim(),
      input.researchNotes.trim(),
      input.source ?? "codex_mcp",
      input.modelIdentifier?.trim() || "codex-mcp",
    ],
  );
  return result.rows[0];
}

export async function archivedProductionRecords(context: OwnerContext, limit: number) {
  const result = await database().query<{
    id: string;
    script_draft_id: string;
    title: string;
    status: string;
    current_step: string;
    artifact_url: string | null;
    youtube_video_id: string | null;
    error_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `select w.id, w.script_draft_id, d.title, w.status, w.current_step,
            w.artifact_url, w.youtube_video_id, w.provider_job_id, w.error_code,
            w.created_at, w.updated_at
       from public.production_workflows w
       join public.script_drafts d on d.id = w.script_draft_id
      where w.channel_id = $1
      order by w.created_at desc
      limit $2`,
    [context.channelId, limit],
  );
  return result.rows;
}

export function insightSnapshot(context: OwnerContext) {
  return {
    source: "calculated_from_stored_youtube_analytics",
    channel: context.channelTitle,
    period: context.period,
    summary: context.workspace.summary,
    topVideos: [...context.workspace.videos]
      .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
      .slice(0, 10),
    insights: buildMarketingInsights(context.workspace.videos),
  };
}
