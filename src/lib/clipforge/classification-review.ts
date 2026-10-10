import type { PoolClient } from "pg";
import { classificationContextSelect } from "./classification-read-sql.mjs";
import { sourceFromRow, suggestion, type ContextRow, type SuggestionRow } from "./classification-read";
import { classificationFingerprint, reviewClassification, suggestionIsStale } from "./classification";
import { pillarAllowed } from "./pillars";
import { classificationLockStatements } from "./classification-locks.mjs";

export const suggestionSelect = `
  select id, content_item_id, suggested_topic, suggested_content_pillar, suggested_production_type,
         topic_confidence::text, pillar_confidence::text, production_type_confidence::text,
         topic_rationale, pillar_rationale, production_type_rationale, provider, model, prompt_version,
         source_fingerprint, source_metadata_synced_at, status, accepted_fields, created_at, reviewed_at
    from public.content_classification_suggestions`;

export async function loadContext(client: PoolClient, ownerId: string, contentItemId: string) {
  const result = await client.query<ContextRow>(
    `${classificationContextSelect}
      where i.owner_id = $1 and i.id = $2`,
    [ownerId, contentItemId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const source = sourceFromRow(row);
  return { row, source, fingerprint: classificationFingerprint(source) };
}

export async function lockClassificationContext(client: PoolClient, ownerId: string, contentItemId: string) {
  for (const [index, statement] of classificationLockStatements.entries()) {
    const locked = await client.query(statement, [ownerId, contentItemId]);
    if (index === 0 && locked.rowCount !== 1) return false;
  }
  return true;
}

export async function reviewLockedSuggestion(client: PoolClient, ownerId: string, contentItemId: string, suggestionId: string, action: "accept" | "reject", fields: readonly string[]) {
  const held = await lockClassificationContext(client, ownerId, contentItemId);
  if (!held) return { kind: "missing" as const };
  const locked = await client.query<SuggestionRow>(
    `${suggestionSelect}
      where id = $1 and content_item_id = $2 and owner_id = $3
      for update`,
    [suggestionId, contentItemId, ownerId],
  );
  const row = locked.rows[0];
  if (!row) return { kind: "missing" as const };
  const context = await loadContext(client, ownerId, contentItemId);
  if (!context) return { kind: "missing" as const };
  const decision = reviewClassification({
    action,
    fields,
    status: row.status,
    stale: suggestionIsStale(row.source_fingerprint, context.fingerprint),
    suggestedTopic: row.suggested_topic,
    suggestedContentPillar: row.suggested_content_pillar,
    suggestedProductionType: row.suggested_production_type,
  });
  if (!decision.ok) {
    const status = decision.error.includes("stale") || decision.error.includes("no longer pending") ? 409 : 400;
    return { kind: "invalid" as const, error: decision.error, status };
  }
  if (decision.kind === "accept") {
    if (decision.updates.contentPillar !== undefined && !pillarAllowed(context.source.projectCode, decision.updates.contentPillar)) {
      return { kind: "invalid" as const, error: "Content pillar is not allowed for this project.", status: 400 as const };
    }
    const values: unknown[] = [];
    const sets: string[] = [];
    for (const [column, value] of [
      ["topic", decision.updates.topic],
      ["content_pillar", decision.updates.contentPillar],
      ["production_type", decision.updates.productionType],
    ] as const) {
      if (value !== undefined) {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (sets.length) {
      values.push(contentItemId, ownerId);
      const updated = await client.query(
        `update public.content_items set ${sets.join(", ")}
          where id = $${values.length - 1} and owner_id = $${values.length}`,
        values,
      );
      if (updated.rowCount !== 1) return { kind: "missing" as const };
    }
    await client.query(
      `update public.content_classification_suggestions
          set status = 'accepted', accepted_fields = $2, reviewed_at = now()
        where id = $1`,
      [suggestionId, decision.acceptedFields],
    );
  } else {
    await client.query(
      `update public.content_classification_suggestions
          set status = 'rejected', reviewed_at = now()
        where id = $1`,
      [suggestionId],
    );
  }
  const saved = await client.query<SuggestionRow>(`${suggestionSelect} where id = $1`, [suggestionId]);
  if (!saved.rows[0]) return { kind: "missing" as const };
  const reviewed = await loadContext(client, ownerId, contentItemId);
  return { kind: "suggestion" as const, suggestion: suggestion(saved.rows[0], reviewed?.fingerprint ?? context.fingerprint) };
}
