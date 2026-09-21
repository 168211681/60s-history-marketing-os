import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";

export type ContentExperimentRecord = {
  id: string;
  topic: string;
  hookFormat: string;
  hypothesis: string;
  status: "planned" | "running" | "completed" | "cancelled";
  resultSummary: string;
  recommendation: string;
  observedViews: number | null;
  observedMinutesWatched: number | null;
  observedAverageViewDurationSeconds: number | null;
  observedLikes: number | null;
  observedComments: number | null;
  scriptDraftId: string | null;
  videoId: string | null;
  createdAt: string;
  completedAt: string | null;
};

export async function contentExperimentsForOwner(): Promise<readonly ContentExperimentRecord[]> {
  const owner = await currentOwner();
  if (!owner || !databaseConfigured()) return [];
  const result = await database().query<{
    id: string; topic: string; hook_format: string; hypothesis: string; status: ContentExperimentRecord["status"];
    result_summary: string; recommendation: string; observed_views: number | null; observed_minutes_watched: number | null;
    observed_average_view_duration_seconds: number | null; observed_likes: number | null; observed_comments: number | null;
    script_draft_id: string | null; video_id: string | null; created_at: Date; completed_at: Date | null;
  }>(
    `select e.id, e.topic, e.hook_format, e.hypothesis, e.status, e.result_summary,
            e.recommendation, e.observed_views, e.observed_minutes_watched,
            e.observed_average_view_duration_seconds, e.observed_likes, e.observed_comments,
            e.script_draft_id, e.video_id, e.created_at, e.completed_at
       from public.content_experiments e
       join public.channels c on c.id = e.channel_id and c.owner_id = $1
      order by e.created_at desc
      limit 50`,
    [owner.id],
  );
  return result.rows.map((row) => ({
    id: row.id, topic: row.topic, hookFormat: row.hook_format, hypothesis: row.hypothesis,
    status: row.status, resultSummary: row.result_summary, recommendation: row.recommendation,
    observedViews: row.observed_views, observedMinutesWatched: row.observed_minutes_watched,
    observedAverageViewDurationSeconds: row.observed_average_view_duration_seconds,
    observedLikes: row.observed_likes, observedComments: row.observed_comments,
    scriptDraftId: row.script_draft_id, videoId: row.video_id,
    createdAt: row.created_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null,
  }));
}

export function nextExperimentMessage(experiments: readonly ContentExperimentRecord[]) {
  const active = experiments.find((experiment) => experiment.status === "planned" || experiment.status === "running");
  return active
    ? `Finish the ${active.status} experiment for “${active.topic}” before introducing another variable.`
    : "Plan a new comparable hook experiment from the latest analytics, then record the result after the next sync.";
}
