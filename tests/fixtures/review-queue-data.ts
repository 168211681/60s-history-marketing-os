import type { PoolClient } from "pg";
import { classificationFingerprint } from "../../src/lib/clipforge/classification";
import { sourceFromRow, type ContextRow, type SuggestionRow } from "../../src/lib/clipforge/classification-read";
import { currentSuggestionsSql, reviewContextsSql, reviewProjectsSql } from "../../src/lib/clipforge/classification-read-sql.mjs";
import { readReviewQueue } from "../../src/lib/clipforge/review-queue-read";
import type { ReviewFilters } from "../../src/lib/clipforge/review-queue";

export const reviewId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const reviewOwner = reviewId(900);
export const reviewProjects = [{ id: reviewId(90), name: "Fictional history project" }, { id: reviewId(91), name: "Fictional archive project" }];
export function reviewContext(n: number): ContextRow & { id: string; project_id: string; project_name: string; scan_created_at: string } {
  const project = reviewProjects[n <= 7 ? 0 : 1];
  return {
    id: reviewId(n), project_id: project.id, project_name: project.name,
    title: n === 1 ? "Sample Antikythera mechanism — a very long title for reviewing ancient engineering on a phone" : `Sample clip ${n}`,
    topic: "", production_type: "unknown", content_pillar: "", project_code: "H60",
    youtube_video_id: null, source_title: null, description: null, tags: null,
    category_id: null, default_language: null, default_audio_language: null,
    privacy_status: null, metadata_synced_at: null,
    scan_created_at: new Date(Date.UTC(2026, 9, 9) - n * 1000).toISOString(),
  };
}
export function reviewSuggestion(n: number, status: SuggestionRow["status"] = "pending", stale = false): SuggestionRow {
  return {
    id: reviewId(100 + n), content_item_id: reviewId(n),
    status, source_fingerprint: stale ? "0".repeat(64) : classificationFingerprint(sourceFromRow(reviewContext(n))),
    suggested_topic: "Ancient engineering", suggested_content_pillar: "Hidden Engineering",
    suggested_production_type: "unknown", topic_confidence: "0.92", pillar_confidence: "0", production_type_confidence: null,
    topic_rationale: "Stored source facts support this suggestion. ".repeat(20),
    pillar_rationale: "An engineering-focused story.", production_type_rationale: "No production evidence is available.",
    provider: "PRIVATE_PROVIDER_FIELD", model: "PRIVATE_MODEL_FIELD", prompt_version: "clipforge-metadata-v1",
    source_metadata_synced_at: null, accepted_fields: [], created_at: "2026-10-09T01:00:00Z", reviewed_at: null,
  };
}

// Fictional adapter for component/unit tests only. Real SQL ownership, selection,
// pagination, and read-only enforcement are exercised in database.test.mjs.
export function reviewFixtureClient(size = 28, fail = false) {
  const records = Array.from({ length: size }, (_,i) => reviewContext(i + 1));
  const suggestions = [reviewSuggestion(1), reviewSuggestion(2, "pending", true), reviewSuggestion(3, "accepted"), reviewSuggestion(4, "rejected"), reviewSuggestion(6, "accepted", true), reviewSuggestion(7, "superseded")];
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = { query: async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (fail) throw new Error("PRIVATE_DATABASE_ERROR");
    if (sql.startsWith("set ")) return { rows: [] };
    if (values[0] !== reviewOwner) return { rows: [] };
    if (sql === reviewContextsSql) {
      const query = String(values[2]).slice(1, -1).replace(/\\([%_\\])/g, "$1").toLowerCase();
      return { rows: records.filter((row) => (!values[1] || row.project_id === values[1])
        && (!values[2] || row.title.toLowerCase().includes(query))
        && (!values[3] || row.scan_created_at < String(values[3]))).slice(0, 100) };
    }
    if (sql === currentSuggestionsSql) return { rows: suggestions.filter((row) => (values[1] as string[]).includes(row.content_item_id)) };
    if (sql === reviewProjectsSql) return { rows: values[1] ? [] : reviewProjects };
    throw new Error(`Unexpected query: ${sql}`);
  } } as unknown as PoolClient;
  return { client, calls };
}
export function reviewFixtureData(filters: ReviewFilters) {
  return readReviewQueue(reviewFixtureClient().client, reviewOwner, filters);
}
