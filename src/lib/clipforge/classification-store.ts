import type { PoolClient } from "pg";
import { currentSuggestionsSql } from "./classification-read-sql.mjs";
import { suggestion, type SuggestionRow } from "./classification-read";
export type { SuggestionRecord } from "./classification-read";
import { aiProvider } from "@/lib/ai/provider";
import { transaction } from "@/lib/database";
import {
  classificationDocument,
  classificationPromptVersion,
  classificationStep,
  finalizeClassification,
  type ClassificationResult,
  type ClassificationSource,
} from "./classification";
import { ContentInputError } from "./model";
import { pillarAllowed } from "./pillars";
import { loadContext, lockClassificationContext, reviewLockedSuggestion, suggestionSelect } from "./classification-review";
export { reviewLockedSuggestion } from "./classification-review";
import { assembleBatchPreview, parseBatchIds, type BatchFoundItem } from "./batch-classification";

async function findByFingerprint(client: PoolClient, ownerId: string, contentItemId: string, fingerprint: string) {
  const result = await client.query<SuggestionRow>(
    `${suggestionSelect}
      where owner_id = $1 and content_item_id = $2 and prompt_version = $3 and source_fingerprint = $4
      order by created_at desc
      limit 1`,
    [ownerId, contentItemId, classificationPromptVersion, fingerprint],
  );
  return result.rows[0] ?? null;
}

async function reopenSuperseded(client: PoolClient, ownerId: string, contentItemId: string, fingerprint: string, row: SuggestionRow) {
  if (row.status !== "superseded") return row;
  await client.query(
    `update public.content_classification_suggestions
        set status = 'pending'
      where id = $1 and owner_id = $2 and content_item_id = $3 and status = 'superseded'`,
    [row.id, ownerId, contentItemId],
  );
  return (await findByFingerprint(client, ownerId, contentItemId, fingerprint)) ?? row;
}

async function suggestionForContext(client: PoolClient, ownerId: string, contentItemId: string, fingerprint: string) {
  const result = await client.query<SuggestionRow>(currentSuggestionsSql, [
    ownerId, [contentItemId], [fingerprint], classificationPromptVersion,
  ]);
  return result.rows[0] ? suggestion(result.rows[0], fingerprint) : null;
}

export async function getMetadataSuggestion(ownerId: string, contentItemId: string) {
  return transaction(async (client) => {
    const context = await loadContext(client, ownerId, contentItemId);
    if (!context) return null;
    return suggestionForContext(client, ownerId, contentItemId, context.fingerprint);
  });
}

async function insertSuggestion(client: PoolClient, ownerId: string, contentItemId: string, source: ClassificationSource, fingerprint: string, parsed: ReturnType<typeof finalizeClassification>, providerName: string, model: string) {
  await client.query(
    `update public.content_classification_suggestions
        set status = 'superseded'
      where owner_id = $1 and content_item_id = $2 and status = 'pending' and source_fingerprint <> $3`,
    [ownerId, contentItemId, fingerprint],
  );
  const inserted = await client.query<SuggestionRow>(
    `insert into public.content_classification_suggestions (
       content_item_id, owner_id, suggested_topic, suggested_content_pillar, suggested_production_type,
       topic_confidence, pillar_confidence, production_type_confidence,
       topic_rationale, pillar_rationale, production_type_rationale,
       provider, model, prompt_version, source_fingerprint, source_metadata_synced_at
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
     )
     returning id, content_item_id, suggested_topic, suggested_content_pillar, suggested_production_type,
               topic_confidence::text, pillar_confidence::text, production_type_confidence::text,
               topic_rationale, pillar_rationale, production_type_rationale, provider, model, prompt_version,
               source_fingerprint, source_metadata_synced_at, status, accepted_fields, created_at, reviewed_at`,
    [
      contentItemId,
      ownerId,
      parsed.topic,
      parsed.contentPillar,
      parsed.productionType,
      parsed.confidence.topic,
      parsed.confidence.contentPillar,
      parsed.confidence.productionType,
      parsed.rationale.topic,
      parsed.rationale.contentPillar,
      parsed.rationale.productionType,
      providerName,
      model,
      classificationPromptVersion,
      fingerprint,
      source.youtube?.metadataSyncedAt ?? null,
    ],
  );
  return inserted.rows[0];
}

export async function commitClassificationResult(
  client: PoolClient,
  input: {
    ownerId: string;
    contentItemId: string;
    inputFingerprint: string;
    parsed: ClassificationResult;
    providerName: string;
    model: string;
    reload: (client: PoolClient) => Promise<{ source: ClassificationSource; fingerprint: string } | null>;
  },
) {
  const held = await lockClassificationContext(client, input.ownerId, input.contentItemId);
  if (!held) return { kind: "missing" as const };
  const current = await input.reload(client);
  if (!current) return { kind: "missing" as const };
  if (current.fingerprint !== input.inputFingerprint) return { kind: "input_changed" as const };
  const again = await findByFingerprint(client, input.ownerId, input.contentItemId, current.fingerprint);
  if (again) {
    const row = await reopenSuperseded(client, input.ownerId, input.contentItemId, current.fingerprint, again);
    return { kind: "suggestion" as const, suggestion: suggestion(row, current.fingerprint) };
  }
  await client.query("savepoint classification_insert");
  try {
    const row = await insertSuggestion(
      client,
      input.ownerId,
      input.contentItemId,
      current.source,
      current.fingerprint,
      input.parsed,
      input.providerName,
      input.model,
    );
    await client.query("release savepoint classification_insert");
    return row ? { kind: "suggestion" as const, suggestion: suggestion(row, current.fingerprint) } : { kind: "missing" as const };
  } catch (error) {
    await client.query("rollback to savepoint classification_insert");
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code !== "23505") throw error;
    const winner = await findByFingerprint(client, input.ownerId, input.contentItemId, current.fingerprint);
    return winner ? { kind: "suggestion" as const, suggestion: suggestion(winner, current.fingerprint) } : { kind: "missing" as const };
  }
}

export async function reuseLockedSuggestion(
  client: PoolClient,
  input: {
    ownerId: string;
    contentItemId: string;
    inputFingerprint: string;
    reload: (client: PoolClient) => Promise<{ source: ClassificationSource; fingerprint: string } | null>;
  },
) {
  const held = await lockClassificationContext(client, input.ownerId, input.contentItemId);
  if (!held) return { kind: "missing" as const };
  const current = await input.reload(client);
  if (!current) return { kind: "missing" as const };
  if (current.fingerprint !== input.inputFingerprint) return { kind: "input_changed" as const };
  const matched = await findByFingerprint(client, input.ownerId, input.contentItemId, current.fingerprint);
  if (!matched) return { kind: "input_changed" as const };
  const row = await reopenSuperseded(client, input.ownerId, input.contentItemId, current.fingerprint, matched);
  return { kind: "suggestion" as const, suggestion: suggestion(row, current.fingerprint) };
}

export async function classifyContentItem(ownerId: string, contentItemId: string) {
  const provider = aiProvider();
  const context = await transaction(async (client) => loadContext(client, ownerId, contentItemId));
  if (!context) return { kind: "missing" as const };
  const inputFingerprint = context.fingerprint;
  const existing = await transaction(async (client) => findByFingerprint(client, ownerId, contentItemId, inputFingerprint));
  const step = classificationStep(Boolean(existing), provider.configured);
  if (step === "reuse" && existing) {
    return transaction((client) => reuseLockedSuggestion(client, {
      ownerId,
      contentItemId,
      inputFingerprint,
      reload: async (db) => {
        const current = await loadContext(db, ownerId, contentItemId);
        return current ? { source: current.source, fingerprint: current.fingerprint } : null;
      },
    }));
  }
  if (step === "unavailable") return { kind: "unconfigured" as const };
  let parsed;
  try {
    parsed = finalizeClassification(await provider.classifyMetadata(classificationDocument(context.source)), context.source);
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") return { kind: "unconfigured" as const };
    throw error;
  }
  return transaction((client) => commitClassificationResult(client, {
    ownerId,
    contentItemId,
    inputFingerprint,
    parsed,
    providerName: provider.name,
    model: provider.model,
    reload: async (db) => {
      const current = await loadContext(db, ownerId, contentItemId);
      return current ? { source: current.source, fingerprint: current.fingerprint } : null;
    },
  }));
}

export async function previewBatchClassification(ownerId: string, ids: unknown) {
  const normalized = parseBatchIds(Array.isArray(ids) ? { ids } : ids);
  if (!normalized.ok) return { kind: "invalid" as const, error: normalized.error };
  const found = new Map<string, BatchFoundItem>();
  for (const id of normalized.ids) {
    const loaded = await transaction(async (client) => {
      const identity = await client.query<{ id: string; title: string; project_id: string; project_name: string }>(
        `select i.id, i.title, i.project_id, p.name as project_name
           from public.content_items i
           join public.projects p on p.id = i.project_id and p.owner_id = i.owner_id
          where i.owner_id = $1 and i.id = $2`,
        [ownerId, id],
      );
      const row = identity.rows[0];
      if (!row) return null;
      const context = await loadContext(client, ownerId, id);
      if (!context) return null;
      const current = await suggestionForContext(client, ownerId, id, context.fingerprint);
      return { row, current };
    });
    if (!loaded) return { kind: "missing" as const };
    found.set(id, {
      id: loaded.row.id,
      title: loaded.row.title,
      projectId: loaded.row.project_id,
      projectName: loaded.row.project_name,
      hasSuggestion: Boolean(loaded.current),
      status: loaded.current?.status ?? null,
      stale: Boolean(loaded.current?.stale),
    });
  }
  const assembled = assembleBatchPreview(normalized.ids, found);
  if (!assembled.ok) return assembled.status === 404 ? { kind: "missing" as const } : { kind: "invalid" as const, error: assembled.error };
  return { kind: "preview" as const, preview: assembled.preview };
}

export async function reviewContentSuggestion(ownerId: string, contentItemId: string, suggestionId: string, action: "accept" | "reject", fields: readonly string[]) {
  return transaction((client) => reviewLockedSuggestion(client, ownerId, contentItemId, suggestionId, action, fields));
}

export async function assertContentPillar(client: PoolClient, ownerId: string, projectId: string, pillar: string) {
  const result = await client.query<{ code: string | null }>(
    "select code from public.projects where id = $1 and owner_id = $2",
    [projectId, ownerId],
  );
  if (!pillarAllowed(result.rows[0]?.code ?? null, pillar)) {
    throw new ContentInputError("Content pillar is not allowed for this project.");
  }
}
