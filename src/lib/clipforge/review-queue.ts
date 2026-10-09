import { planBatchItem } from "./batch-classification";
import { isUuid, type ProductionType } from "./model";

export const reviewStates = ["all", "pending", "stale", "accepted", "rejected", "not_generated", "superseded"] as const;
export type ReviewState = (typeof reviewStates)[number];
export const reviewLabels: Record<ReviewState, string> = {
  all: "All", pending: "Pending review", stale: "Stale", accepted: "Accepted",
  rejected: "Rejected", not_generated: "Not generated", superseded: "Superseded",
};
export const REVIEW_PAGE_SIZE = 20;
export type ReviewFilters = { state: ReviewState; project: string; q: string; page: number };
export type ReviewParams = Record<string, string | string[] | undefined>;

export function parseReviewFilters(params: ReviewParams): ReviewFilters | null {
  if ([params.state, params.project, params.q, params.page].some(Array.isArray)) return null;
  const state = params.state || "all";
  const project = params.project || "";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = params.page || "1";
  if (!reviewStates.includes(state as ReviewState) || typeof project !== "string"
    || (project && !isUuid(project)) || q.length > 200 || typeof page !== "string"
    || !/^[1-9]\d{0,5}$/.test(page)) return null;
  return { state: state as ReviewState, project, q, page: Number(page) };
}

export type ReviewSuggestion = {
  status: "pending" | "accepted" | "rejected" | "superseded";
  stale: boolean;
  suggestedTopic: string | null;
  suggestedContentPillar: string | null;
  suggestedProductionType: ProductionType;
  topicConfidence: number | null;
  pillarConfidence: number | null;
  productionTypeConfidence: number | null;
  topicRationale: string;
  pillarRationale: string;
  productionTypeRationale: string;
};
export type ReviewItem = {
  id: string; title: string; projectId: string; projectName: string;
  state: Exclude<ReviewState, "all">; suggestion: ReviewSuggestion | null;
};
export type ReviewQueueData = {
  items: ReviewItem[];
  totals: Record<ReviewState, number>;
  projects: { id: string; name: string }[];
  pageCount: number;
};

export function reviewState(suggestion: Pick<ReviewSuggestion, "status" | "stale"> | null): ReviewItem["state"] {
  const plan = planBatchItem({ hasSuggestion: Boolean(suggestion), status: suggestion?.status ?? null, stale: suggestion?.stale ?? false });
  return reviewStates.find((state) => reviewLabels[state] === plan.state) as ReviewItem["state"];
}

export function reviewHref(filters: ReviewFilters, changes: Partial<ReviewFilters> = {}) {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.project) params.set("project", next.project);
  if (next.state !== "all") params.set("state", next.state);
  if (next.page > 1) params.set("page", String(next.page));
  return `/review${params.size ? `?${params}` : ""}`;
}

export function reviewConfidence(value: number | null) {
  return value === null ? "Unavailable" : `${Math.round(value * 100)}%`;
}

export function conciseRationale(value: string) {
  const text = value.trim();
  return text ? (text.length > 240 ? `${text.slice(0, 237)}…` : text) : "No rationale stored.";
}
