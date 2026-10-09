import { isUuid } from "./model";

export const BATCH_CLASSIFICATION_LIMIT = 5;

export const BATCH_PER_RUN_LIMIT_MESSAGE =
  "A batch classifies at most 5 content items per run. This is not a daily quota.";

export type BatchSuggestionStatus = "pending" | "accepted" | "rejected" | "superseded";
export type BatchAction = "generate" | "skip" | "decide";
export type BatchState = "Not generated" | "Pending review" | "Accepted" | "Rejected" | "Stale" | "Superseded";
export type BatchOutcome = "success" | "failed" | "not_started";

export type BatchPlan = {
  state: BatchState;
  action: BatchAction;
  countsAsNewRequest: boolean;
};

export type BatchPreviewItem = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  state: BatchState;
  action: BatchAction;
};

export type BatchPreview = {
  limit: typeof BATCH_CLASSIFICATION_LIMIT;
  limitKind: "per-run";
  items: BatchPreviewItem[];
  newRequestCount: number;
  skippedCount: number;
  separateDecisionCount: number;
};

export type BatchFoundItem = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  hasSuggestion: boolean;
  status: BatchSuggestionStatus | null;
  stale: boolean;
};

export type BatchItemResult = {
  id: string;
  title: string;
  outcome: BatchOutcome;
  detail: string;
};

const batchStates: readonly BatchState[] = ["Not generated", "Pending review", "Accepted", "Rejected", "Stale", "Superseded"];

export function parseBatchIds(value: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Choose content items from your library." };
  }
  const ids = (value as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return { ok: false, error: "Choose content items from your library." };
  if (ids.length < 1) return { ok: false, error: "Select at least one content item." };
  if (ids.length > BATCH_CLASSIFICATION_LIMIT) return { ok: false, error: BATCH_PER_RUN_LIMIT_MESSAGE };
  if (ids.some((id) => typeof id !== "string" || !isUuid(id))) {
    return { ok: false, error: "Choose content items from your library." };
  }
  if (new Set(ids).size !== ids.length) return { ok: false, error: "Each content item can be selected once." };
  return { ok: true, ids: [...ids] };
}

export function toggleBatchSelection(selected: readonly string[], id: string) {
  if (!isUuid(id)) return { selected: [...selected], rejected: true };
  if (selected.includes(id)) return { selected: selected.filter((item) => item !== id), rejected: false };
  if (selected.length >= BATCH_CLASSIFICATION_LIMIT) return { selected: [...selected], rejected: true };
  return { selected: [...selected, id], rejected: false };
}

export function planBatchItem(input: {
  hasSuggestion: boolean;
  status: BatchSuggestionStatus | null;
  stale: boolean;
}): BatchPlan {
  if (!input.hasSuggestion || !input.status) {
    return { state: "Not generated", action: "generate", countsAsNewRequest: true };
  }
  if (input.status === "accepted") return { state: "Accepted", action: "skip", countsAsNewRequest: false };
  if (input.status === "rejected") return { state: "Rejected", action: "skip", countsAsNewRequest: false };
  if (input.status === "superseded") return { state: "Superseded", action: "skip", countsAsNewRequest: false };
  if (input.stale) return { state: "Stale", action: "decide", countsAsNewRequest: false };
  return { state: "Pending review", action: "skip", countsAsNewRequest: false };
}

export function summarizeBatch(items: readonly BatchPreviewItem[]): BatchPreview {
  return {
    limit: BATCH_CLASSIFICATION_LIMIT,
    limitKind: "per-run",
    items: [...items],
    newRequestCount: items.filter((item) => item.action === "generate").length,
    skippedCount: items.filter((item) => item.action === "skip").length,
    separateDecisionCount: items.filter((item) => item.action === "decide").length,
  };
}

export function assembleBatchPreview(ids: readonly string[], found: ReadonlyMap<string, BatchFoundItem>) {
  const parsed = parseBatchIds({ ids: [...ids] });
  if (!parsed.ok) return { ok: false as const, error: parsed.error, status: 400 as const };
  const items: BatchPreviewItem[] = [];
  for (const id of parsed.ids) {
    const record = found.get(id);
    if (!record || record.id !== id) return { ok: false as const, error: "Content item was not found.", status: 404 as const };
    const plan = planBatchItem(record);
    items.push({
      id,
      title: record.title,
      projectId: record.projectId,
      projectName: record.projectName,
      state: plan.state,
      action: plan.action,
    });
  }
  return { ok: true as const, preview: summarizeBatch(items) };
}

export function generationQueue(items: readonly Pick<BatchPreviewItem, "id" | "title" | "action">[]) {
  return items.filter((item) => item.action === "generate").slice(0, BATCH_CLASSIFICATION_LIMIT).map((item) => ({
    id: item.id,
    title: item.title,
  }));
}

export function isBatchPreview(value: unknown): value is BatchPreview {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<BatchPreview>;
  if (record.limit !== BATCH_CLASSIFICATION_LIMIT || record.limitKind !== "per-run") return false;
  if (!Array.isArray(record.items) || record.items.length < 1 || record.items.length > BATCH_CLASSIFICATION_LIMIT) return false;
  if (typeof record.newRequestCount !== "number" || typeof record.skippedCount !== "number" || typeof record.separateDecisionCount !== "number") {
    return false;
  }
  return record.items.every((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Partial<BatchPreviewItem>;
    return typeof row.id === "string"
      && isUuid(row.id)
      && typeof row.title === "string"
      && typeof row.projectId === "string"
      && isUuid(row.projectId)
      && typeof row.projectName === "string"
      && typeof row.state === "string"
      && batchStates.includes(row.state as BatchState)
      && (row.action === "generate" || row.action === "skip" || row.action === "decide");
  });
}

export function batchFailureMessage(status: number, error: string | null) {
  if (error === "AI_NOT_CONFIGURED" || status === 503) return "The AI provider is not configured. No suggestion was stored. This request was not retried.";
  if (error === "CLASSIFICATION_INPUT_CHANGED" || status === 409) {
    return "Source metadata changed while classification was running. Generate again on that clip. This request was not retried.";
  }
  if (status === 429) return "The classifier rate limit was reached. This run stopped and the request was not retried.";
  if (status === 502) return "The classifier returned an unusable result. This request was not retried.";
  return error || "Could not generate a suggestion. This request was not retried.";
}

export function failureDecision(status: number): "continue" | "stop" {
  if (status === 429 || status === 503) return "stop";
  return "continue";
}

export function batchOutcomeLabel(outcome: BatchOutcome) {
  if (outcome === "success") return "Success";
  if (outcome === "failed") return "Failed";
  return "Not started";
}

export function batchProgressLabel(completed: number, total: number) {
  return `${completed}/${total}`;
}

export function claimBatchRun(gate: { current: boolean }) {
  if (gate.current) return false;
  gate.current = true;
  return true;
}

export function releaseBatchRun(gate: { current: boolean }) {
  gate.current = false;
}

export async function runBatchClassification(input: {
  queue: ReadonlyArray<{ id: string; title: string }>;
  classify: (id: string) => Promise<{ ok: true } | { ok: false; status: number; error: string | null }>;
  shouldContinue: () => boolean;
  onProgress?: (event: { completed: number; total: number; results: BatchItemResult[] }) => void;
}) {
  const total = input.queue.length;
  const results: BatchItemResult[] = [];
  const report = () => input.onProgress?.({ completed: results.length, total, results: [...results] });
  for (let index = 0; index < input.queue.length; index += 1) {
    if (!input.shouldContinue()) {
      for (const rest of input.queue.slice(index)) {
        results.push({
          id: rest.id,
          title: rest.title,
          outcome: "not_started",
          detail: "Stopped before this request. Suggestions already stored stay saved.",
        });
      }
      report();
      return results;
    }
    const item = input.queue[index];
    report();
    let outcome: { ok: true } | { ok: false; status: number; error: string | null };
    try {
      outcome = await input.classify(item.id);
    } catch {
      results.push({ id: item.id, title: item.title, outcome: "failed", detail: batchFailureMessage(0, null) });
      continue;
    }
    if (outcome.ok) {
      results.push({
        id: item.id,
        title: item.title,
        outcome: "success",
        detail: "Suggestion stored. Review it on the clip. Canonical metadata was not changed.",
      });
      continue;
    }
    results.push({ id: item.id, title: item.title, outcome: "failed", detail: batchFailureMessage(outcome.status, outcome.error) });
    if (failureDecision(outcome.status) === "stop") {
      const detail = outcome.status === 429
        ? "Not started because the run stopped after a rate limit. Nothing was retried."
        : "Not started because the AI provider is unavailable. Nothing was retried.";
      for (const rest of input.queue.slice(index + 1)) {
        results.push({ id: rest.id, title: rest.title, outcome: "not_started", detail });
      }
      report();
      return results;
    }
  }
  report();
  return results;
}
