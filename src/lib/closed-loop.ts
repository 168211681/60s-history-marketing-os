export type ReportingWindow = { from: string; through: string };
export type ComparableWindowResult = { comparable: true; days: number } | { comparable: false; reason: string };
export type MetricValue = number | null;
export type ExperimentMetrics = {
  views: MetricValue;
  averageViewDurationSeconds: MetricValue;
  likes: MetricValue;
  comments: MetricValue;
};
export type EvidenceState = "sufficient" | "insufficient";
export type ExperimentStatus = "planned" | "running" | "completed" | "cancelled";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string) {
  if (!datePattern.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function reportingWindowDays(window: ReportingWindow): number | null {
  const from = parseDate(window.from);
  const through = parseDate(window.through);
  if (!from || !through || through < from) return null;
  return Math.floor((through.getTime() - from.getTime()) / 86_400_000) + 1;
}

export function compareReportingWindows(a: ReportingWindow, b: ReportingWindow): ComparableWindowResult {
  const aDays = reportingWindowDays(a);
  const bDays = reportingWindowDays(b);
  if (aDays === null || bDays === null) return { comparable: false, reason: "Invalid reporting window" };
  if (aDays !== bDays) return { comparable: false, reason: "Reporting windows must cover the same number of days" };
  return { comparable: true, days: aDays };
}

export function normalizeMetric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function percentDifference(baseline: MetricValue, candidate: MetricValue): number | null {
  const base = normalizeMetric(baseline);
  const next = normalizeMetric(candidate);
  if (base === null || next === null || base === 0) return null;
  return ((next - base) / Math.abs(base)) * 100;
}

export function evidenceSufficiency(
  windows: ComparableWindowResult,
  baseline: ExperimentMetrics,
  candidate: ExperimentMetrics,
): EvidenceState {
  if (!windows.comparable) return "insufficient";
  const required = [baseline.views, candidate.views, baseline.averageViewDurationSeconds, candidate.averageViewDurationSeconds];
  return required.every((value) => normalizeMetric(value) !== null) ? "sufficient" : "insufficient";
}

export type ExperimentEvaluation = {
  evidence: EvidenceState;
  observation: string;
  comparison: string;
  hypothesis: string;
  recommendation: string;
};

export function evaluateExperiment(input: {
  hypothesis: string;
  nextTest: string;
  baselineWindow: ReportingWindow;
  candidateWindow: ReportingWindow;
  baseline: ExperimentMetrics;
  candidate: ExperimentMetrics;
}): ExperimentEvaluation {
  const windows = compareReportingWindows(input.baselineWindow, input.candidateWindow);
  const evidence = evidenceSufficiency(windows, input.baseline, input.candidate);
  if (evidence === "insufficient") {
    return {
      evidence,
      observation: "Insufficient evidence: one or more required metrics are unavailable.",
      comparison: windows.comparable ? "No comparison was calculated because required metrics are missing." : windows.reason,
      hypothesis: input.hypothesis,
      recommendation: input.nextTest,
    };
  }
  const viewDifference = percentDifference(input.baseline.views, input.candidate.views);
  const durationDifference = percentDifference(input.baseline.averageViewDurationSeconds, input.candidate.averageViewDurationSeconds);
  return {
    evidence,
    observation: `Observed candidate window: ${input.candidate.views} views and ${input.candidate.averageViewDurationSeconds} seconds average view duration.`,
    comparison: `Compared with the same ${windows.comparable ? windows.days : 0}-day baseline window: views ${viewDifference!.toFixed(1)}%; average view duration ${durationDifference!.toFixed(1)}%.`,
    hypothesis: input.hypothesis,
    recommendation: input.nextTest,
  };
}

export function containsCausalLanguage(value: string) {
  return /\b(caused|causes|made it viral|guarantee|will go viral)\b/i.test(value);
}
