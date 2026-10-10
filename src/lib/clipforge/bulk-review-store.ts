import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../database";
import { classificationFingerprint, classificationPromptVersion, reviewClassification } from "./classification";
import { classificationContextSelect, currentSuggestionsSql } from "./classification-read-sql.mjs";
import { sourceFromRow, suggestion, type ContextRow, type SuggestionRow } from "./classification-read";
import { lockClassificationContext, reviewLockedSuggestion, suggestionSelect } from "./classification-review";
import { isUuid } from "./model";
import { pillarAllowed } from "./pillars";
import { bulkFields, parseBulkConfirmation, parseBulkSelection, type BulkConfirmation, type BulkOutcome, type BulkPreview, type BulkPreviewItem, type BulkSelection } from "./bulk-review";

export class BulkReviewConflict extends Error {
  constructor(message = "The batch changed or is no longer eligible. Nothing was changed. Refresh and preview again.") { super(message); }
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// The verified server owner supplies this identity. SET LOCAL removes a privileged
// connection's BYPASSRLS for this transaction; it cannot leak through the pool.
export async function scopeBulkReview(client: PoolClient, ownerId: string, readonly: boolean) {
  if (!isUuid(ownerId)) throw new BulkReviewConflict();
  if (readonly) await client.query("set transaction isolation level repeatable read, read only");
  await client.query("set local role clipforge_bulk_reviewer");
  await client.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [ownerId, JSON.stringify({ sub: ownerId, role: "clipforge_bulk_reviewer" })]);
  await client.query("set local statement_timeout = '5s'");
  await client.query("set local lock_timeout = '3s'");
}

async function loadBatch(client: PoolClient, ownerId: string, input: BulkSelection): Promise<BulkPreviewItem[]> {
  const contexts = await client.query<ContextRow & { id: string; project_id: string; project_name: string }>(
    `${classificationContextSelect} where i.owner_id = $1 and i.id = any($2::uuid[]) order by i.id limit 10`,
    [ownerId, input.items.map((i) => i.contentItemId)],
  );
  // Missing and foreign IDs are indistinguishable; never return a partial batch.
  if (contexts.rows.length !== input.items.length) throw new BulkReviewConflict("One or more clips are unavailable. Nothing was changed. Refresh your queue.");
  const fingerprints = contexts.rows.map((r) => classificationFingerprint(sourceFromRow(r)));
  const selected = await client.query<SuggestionRow>(currentSuggestionsSql, [ownerId, contexts.rows.map((r) => r.id), fingerprints, classificationPromptVersion]);
  return contexts.rows.map((row, index) => {
    const choice = input.items.find((i) => i.contentItemId === row.id)!;
    const stored = selected.rows.find((s) => s.content_item_id === row.id);
    const record = stored ? suggestion(stored, fingerprints[index]) : null;
    const current = { topic: row.topic, content_pillar: row.content_pillar, production_type: row.production_type };
    // Revision includes canonical pillar/project identity (not part of the AI
    // fingerprint) and the entire stored suggestion. Browser AI values are ignored.
    const version = digest({ fingerprint: fingerprints[index], current, projectId: row.project_id, projectName: row.project_name, record });
    if (choice.version && (choice.version !== version || choice.suggestionId !== record?.id)) throw new BulkReviewConflict();
    const eligible = Boolean(record && record.status === "pending" && !record.stale && record.promptVersion === classificationPromptVersion);
    const availableFields = eligible && record ? bulkFields.filter((field) => {
      const result = reviewClassification({ action: "accept", fields: [field], status: record.status, stale: record.stale, suggestedTopic: record.suggestedTopic, suggestedContentPillar: record.suggestedContentPillar, suggestedProductionType: record.suggestedProductionType });
      return result.ok && (field !== "content_pillar" || pillarAllowed(row.project_code, record.suggestedContentPillar ?? ""));
    }) : [];
    const warnings: string[] = [];
    if (!record) warnings.push("No current suggestion. Open the clip to inspect it.");
    else if (!eligible) warnings.push("Only current, pending, non-stale suggestions can be reviewed in a batch.");
    if (input.action === "accept" && eligible) {
      if (!choice.fields.length) warnings.push("Choose at least one field for this clip.");
      if (choice.fields.some((f) => !availableFields.includes(f))) warnings.push("A selected field is missing or not allowed for this project.");
    }
    return {
      contentItemId: row.id, title: row.title, projectName: row.project_name, current,
      suggestionId: record?.id ?? null, version, eligible, availableFields, fields: choice.fields, warnings,
      suggestion: record ? {
        status: record.status, stale: record.stale, suggestedTopic: record.suggestedTopic,
        suggestedContentPillar: record.suggestedContentPillar, suggestedProductionType: record.suggestedProductionType,
        topicConfidence: record.topicConfidence, pillarConfidence: record.pillarConfidence, productionTypeConfidence: record.productionTypeConfidence,
        topicRationale: record.topicRationale, pillarRationale: record.pillarRationale, productionTypeRationale: record.productionTypeRationale,
      } : null,
    };
  });
}

export async function previewBulkReview(client: PoolClient, ownerId: string, value: unknown): Promise<BulkPreview> {
  const input = parseBulkSelection(value);
  if (!input) throw new BulkReviewConflict("Invalid selection. Choose 1–10 different clips.");
  await scopeBulkReview(client, ownerId, true);
  const items = await loadBatch(client, ownerId, input);
  const ready = items.filter((i) => i.eligible && !i.warnings.length).length;
  return { requestId: randomUUID(), action: input.action, items, affected: ready, canConfirm: ready === items.length };
}

type AuditRow = { request_hash: string; action: "accept" | "reject"; items: BulkConfirmation["items"]; completed_at: Date };
export async function confirmBulkReview(client: PoolClient, ownerId: string, value: unknown): Promise<BulkOutcome> {
  const input = parseBulkConfirmation(value);
  if (!input) throw new BulkReviewConflict("Invalid confirmation. Preview the batch again.");
  await scopeBulkReview(client, ownerId, false);
  const items = [...input.items].sort((a, b) => a.contentItemId.localeCompare(b.contentItemId));
  const requestHash = digest({ action: input.action, items });
  // Unique-key arbitration waits for a concurrent identical request to commit or
  // roll back. The audit row is invisible until ALL decisions commit with it.
  const inserted = await client.query<AuditRow>(
    `insert into public.content_bulk_review_batches (owner_id, request_id, action, request_hash, items)
     values ($1,$2,$3,$4,$5::jsonb) on conflict (owner_id, request_id) do nothing
     returning request_hash, action, items, completed_at`,
    [ownerId, input.requestId, input.action, requestHash, JSON.stringify(items)],
  );
  if (!inserted.rows[0]) {
    const previous = await client.query<AuditRow>("select request_hash, action, items, completed_at from public.content_bulk_review_batches where owner_id=$1 and request_id=$2", [ownerId, input.requestId]);
    const row = previous.rows[0];
    if (!row || row.request_hash !== requestHash) throw new BulkReviewConflict("This request ID was used for a different batch. Nothing was changed.");
    return { requestId: input.requestId, action: row.action, affected: row.items.length, completedAt: row.completed_at.toISOString(), replayed: true };
  }
  // All content locks first, in UUID order; then reuse the existing context
  // order (project, platform, channel, video), followed by suggestion locks.
  const locked = await client.query("select id from public.content_items where owner_id=$1 and id=any($2::uuid[]) order by id for update", [ownerId, items.map((i) => i.contentItemId)]);
  if (locked.rowCount !== items.length) throw new BulkReviewConflict();
  for (const item of items) {
    if (!await lockClassificationContext(client, ownerId, item.contentItemId)) throw new BulkReviewConflict();
  }
  await client.query(`${suggestionSelect} where owner_id=$1 and content_item_id=any($2::uuid[]) and id=any($3::uuid[]) order by content_item_id, id for update`, [ownerId, items.map((i) => i.contentItemId), items.map((i) => i.suggestionId)]);
  const preview = await loadBatch(client, ownerId, { action: input.action, items });
  if (preview.some((i) => !i.eligible || i.warnings.length)) throw new BulkReviewConflict();
  for (const item of items) {
    const result = await reviewLockedSuggestion(client, ownerId, item.contentItemId, item.suggestionId, input.action, item.fields);
    // Throw, never return a failure from a transaction: earlier updates and the
    // audit insert MUST roll back together, including unexpected mid-batch errors.
    if (result.kind !== "suggestion" || result.suggestion.status !== (input.action === "accept" ? "accepted" : "rejected")) throw new BulkReviewConflict();
  }
  return { requestId: input.requestId, action: input.action, affected: items.length, completedAt: inserted.rows[0].completed_at.toISOString(), replayed: false };
}

export const getBulkReviewPreview = (ownerId: string, body: unknown) => transaction((client) => previewBulkReview(client, ownerId, body));
export const commitBulkReview = (ownerId: string, body: unknown) => transaction((client) => confirmBulkReview(client, ownerId, body));
