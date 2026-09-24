import { currentOwner } from "@/lib/auth/server";
import { database, databaseConfigured } from "@/lib/database";
import {
  evaluateExperiment,
  normalizeMetric,
  type ExperimentEvaluation,
  type ExperimentMetrics,
  type ExperimentStatus,
  type ReportingWindow,
} from "@/lib/closed-loop";

export type ExperimentRecord = {
  id: string;
  channelId: string;
  title: string | null;
  hypothesis: string;
  hookFormat: string;
  status: ExperimentStatus;
  reportingWindowDays: number | null;
  contentIdeaTitle: string | null;
  scriptTitle: string | null;
  videoTitle: string | null;
  videoPublishedAt: string | null;
  evaluation: ExperimentEvaluation;
};

type MetricRow = {
  views: string | number | null;
  average_view_duration_seconds: string | number | null;
  likes: string | number | null;
  comments: string | number | null;
};

function aggregate(rows: readonly MetricRow[]): ExperimentMetrics {
  const sum = (field: keyof MetricRow) => {
    const values = rows.map((row) => normalizeMetric(row[field]));
    return values.length > 0 && values.every((value) => value !== null)
      ? values.reduce((total, value) => total + (value ?? 0), 0)
      : null;
  };
  const durations = rows.map((row) => normalizeMetric(row.average_view_duration_seconds));
  return {
    views: sum("views"),
    likes: sum("likes"),
    comments: sum("comments"),
    averageViewDurationSeconds:
      durations.length > 0 && durations.every((value) => value !== null)
        ? durations.reduce((total, value) => total + (value ?? 0), 0) / durations.length
        : null,
  };
}

function windowFor(publishedAt: string | null, days: number | null): ReportingWindow | null {
  if (!publishedAt || days === null || ![1, 7, 28].includes(days)) return null;
  const from = new Date(publishedAt);
  if (Number.isNaN(from.getTime())) return null;
  const through = new Date(from);
  through.setUTCDate(through.getUTCDate() + days - 1);
  return { from: from.toISOString().slice(0, 10), through: through.toISOString().slice(0, 10) };
}

export async function experimentsForOwner(): Promise<readonly ExperimentRecord[]> {
  const owner = await currentOwner();
  if (!owner || !databaseConfigured()) return [];
  const result = await database().query<{
    id: string; channel_id: string; title: string | null; hypothesis: string; hook_format: string;
    status: ExperimentStatus; reporting_window_days: number | null; content_idea_title: string | null;
    script_title: string | null; video_id: string | null; video_title: string | null;
    video_published_at: Date | string | null;
  }>(
    `select e.id, e.channel_id, e.title, e.hypothesis, e.hook_format, e.status,
            e.reporting_window_days, i.title as content_idea_title, d.title as script_title,
            v.id as video_id, v.title as video_title, v.published_at as video_published_at
       from public.content_experiments e
       join public.channels c on c.id = e.channel_id and c.owner_id = $1
       left join public.content_ideas i on i.id = e.content_idea_id and i.channel_id = e.channel_id
       left join public.script_drafts d on d.id = e.script_draft_id and d.channel_id = e.channel_id
       left join public.videos v on v.id = e.video_id and v.channel_id = e.channel_id
      order by e.created_at desc limit 50`,
    [owner.id],
  );
  const records: ExperimentRecord[] = [];
  for (const row of result.rows) {
    const published = row.video_published_at ? new Date(row.video_published_at).toISOString() : null;
    const candidateWindow = windowFor(published, row.reporting_window_days);
    let candidate: ExperimentMetrics = { views: null, averageViewDurationSeconds: null, likes: null, comments: null };
    let baseline: ExperimentMetrics = { views: null, averageViewDurationSeconds: null, likes: null, comments: null };
    let baselineWindow = candidateWindow;
    if (candidateWindow && row.video_id) {
      const candidateRows = await database().query<MetricRow>(
        `select views, average_view_duration_seconds, likes, comments from public.video_metrics
          where video_id = $1 and metric_date between $2 and $3`,
        [row.video_id, candidateWindow.from, candidateWindow.through],
      );
      candidate = aggregate(candidateRows.rows);
      const baselineRows = await database().query<MetricRow>(
        `select vm.views, vm.average_view_duration_seconds, vm.likes, vm.comments
           from public.videos v join public.video_metrics vm on vm.video_id = v.id
          where v.channel_id = $1 and v.id <> $2 and v.published_at is not null
            and v.published_at < $3::date
            and vm.metric_date between v.published_at::date and (v.published_at::date + ($4 - 1) * interval '1 day')`,
        [row.channel_id, row.video_id, candidateWindow.from, row.reporting_window_days],
      );
      baseline = aggregate(baselineRows.rows);
      if (baselineRows.rowCount === 0) baselineWindow = null;
    }
    records.push({
      id: row.id,
      channelId: row.channel_id,
      title: row.title,
      hypothesis: row.hypothesis,
      hookFormat: row.hook_format,
      status: row.status,
      reportingWindowDays: row.reporting_window_days,
      contentIdeaTitle: row.content_idea_title,
      scriptTitle: row.script_title,
      videoTitle: row.video_title,
      videoPublishedAt: published,
      evaluation: evaluateExperiment({
        hypothesis: row.hypothesis,
        nextTest: "Run another comparable test and record the same reporting window before drawing a conclusion.",
        baselineWindow: baselineWindow ?? { from: "2020-01-01", through: "2020-01-01" },
        candidateWindow: candidateWindow ?? { from: "2020-01-01", through: "2020-01-01" },
        baseline,
        candidate,
      }),
    });
  }
  return records;
}
