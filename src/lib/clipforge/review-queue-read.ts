import type { PoolClient, QueryResult } from "pg";
import { classificationFingerprint, classificationPromptVersion } from "./classification";
import { sourceFromRow, suggestion, type ContextRow, type SuggestionRow } from "./classification-read";
import { classificationReadBatchSize, currentSuggestionsSql, reviewContextsSql, reviewProjectsSql } from "./classification-read-sql.mjs";
import { escapeLike, isUuid } from "./model";
import { REVIEW_PAGE_SIZE, conciseRationale, reviewState, reviewStates, type ReviewFilters, type ReviewItem, type ReviewQueueData } from "./review-queue";

type QueueContextRow = ContextRow & {
  id: string; project_id: string; project_name: string; scan_created_at: string;
};

// Receives a transaction client, never a browser-supplied owner identity.
// Fingerprints are computed by the same Node function as the clip review. Exact
// totals therefore scan sources in bounded keyset batches, retaining one UI page
// and counters, never full histories. Fail rather than return partial totals.
export async function readReviewQueue(client: PoolClient, ownerId: string, filters: ReviewFilters): Promise<ReviewQueueData> {
  if (!isUuid(ownerId)) throw new Error("Invalid owner");
  await client.query("set transaction isolation level repeatable read, read only");
  await client.query("set local statement_timeout = '5s'");
  const deadline = Date.now() + 15_000;
  const checkDeadline = () => { if (Date.now() > deadline) throw new Error("Review queue read timed out"); };
  const totals = Object.fromEntries(reviewStates.map((state) => [state, 0])) as ReviewQueueData["totals"];
  const items: ReviewItem[] = [];
  let afterTime: string | null = null;
  let afterId: string | null = null;
  let matched = 0;
  const start = (filters.page - 1) * REVIEW_PAGE_SIZE;
  while (true) {
    checkDeadline();
    const contexts: QueryResult<QueueContextRow> = await client.query<QueueContextRow>(reviewContextsSql, [
      ownerId, filters.project || null, filters.q ? escapeLike(filters.q) : "", afterTime, afterId,
    ]);
    if (!contexts.rows.length) break;
    const fingerprints = contexts.rows.map((row) => classificationFingerprint(sourceFromRow(row)));
    const current = await client.query<SuggestionRow>(currentSuggestionsSql, [ownerId, contexts.rows.map((row) => row.id), fingerprints, classificationPromptVersion]);
    const byItem = new Map(current.rows.map((row) => [row.content_item_id, row]));
    for (const [index, row] of contexts.rows.entries()) {
      const stored = byItem.get(row.id);
      const record = stored ? suggestion(stored, fingerprints[index]) : null;
      const state = reviewState(record);
      totals.all += 1;
      totals[state] += 1;
      if (filters.state !== "all" && filters.state !== state) continue;
      matched += 1;
      if (matched <= start || items.length >= REVIEW_PAGE_SIZE) continue;
      items.push({
        id: row.id, title: row.title, projectId: row.project_id, projectName: row.project_name, state,
        // Explicit allowlist: no provider config, source documents, fingerprints,
        // or internal identifiers are serialized into the queue view.
        suggestion: record ? {
          status: record.status, stale: record.stale,
          suggestedTopic: record.suggestedTopic, suggestedContentPillar: record.suggestedContentPillar,
          suggestedProductionType: record.suggestedProductionType,
          topicConfidence: record.topicConfidence, pillarConfidence: record.pillarConfidence,
          productionTypeConfidence: record.productionTypeConfidence,
          topicRationale: conciseRationale(record.topicRationale),
          pillarRationale: conciseRationale(record.pillarRationale),
          productionTypeRationale: conciseRationale(record.productionTypeRationale),
        } : null,
      });
    }
    const last = contexts.rows.at(-1)!;
    afterTime = last.scan_created_at;
    afterId = last.id;
    if (contexts.rows.length < classificationReadBatchSize) break;
  }
  const projects: ReviewQueueData["projects"] = [];
  let afterProject: string | null = null;
  while (true) {
    checkDeadline();
    const batch: QueryResult<{ id: string; name: string }> = await client.query(reviewProjectsSql, [ownerId, afterProject]);
    projects.push(...batch.rows);
    if (batch.rows.length < classificationReadBatchSize) break;
    afterProject = batch.rows.at(-1)!.id;
  }
  checkDeadline();
  projects.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { items, totals, projects, pageCount: Math.max(1, Math.ceil(matched / REVIEW_PAGE_SIZE)) };
}
