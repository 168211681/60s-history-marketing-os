import { suggestionIsStale, type ClassificationField, type ClassificationSource, type ClassificationYoutube } from "./classification";
import type { ProductionType } from "./model";

export type SuggestionRecord = {
  id: string;
  contentItemId: string;
  suggestedTopic: string | null;
  suggestedContentPillar: string | null;
  suggestedProductionType: ProductionType;
  topicConfidence: number | null;
  pillarConfidence: number | null;
  productionTypeConfidence: number | null;
  topicRationale: string;
  pillarRationale: string;
  productionTypeRationale: string;
  provider: string;
  model: string;
  promptVersion: string;
  sourceFingerprint: string;
  sourceMetadataSyncedAt: string | null;
  status: "pending" | "accepted" | "rejected" | "superseded";
  acceptedFields: ClassificationField[];
  createdAt: string;
  reviewedAt: string | null;
  stale: boolean;
};

export type SuggestionRow = {
  id: string;
  content_item_id: string;
  suggested_topic: string | null;
  suggested_content_pillar: string | null;
  suggested_production_type: ProductionType;
  topic_confidence: string | null;
  pillar_confidence: string | null;
  production_type_confidence: string | null;
  topic_rationale: string;
  pillar_rationale: string;
  production_type_rationale: string;
  provider: string;
  model: string;
  prompt_version: string;
  source_fingerprint: string;
  source_metadata_synced_at: Date | string | null;
  status: SuggestionRecord["status"];
  accepted_fields: string[] | null;
  created_at: Date | string;
  reviewed_at: Date | string | null;
};

export type ContextRow = {
  title: string;
  topic: string;
  production_type: ProductionType;
  project_code: string | null;
  content_pillar: string;
  youtube_video_id: string | null;
  source_title: string | null;
  description: string | null;
  tags: string[] | null;
  category_id: string | null;
  default_language: string | null;
  default_audio_language: string | null;
  privacy_status: string | null;
  metadata_synced_at: Date | string | null;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function numberOrNull(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function suggestion(row: SuggestionRow, currentFingerprint: string): SuggestionRecord {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    suggestedTopic: row.suggested_topic,
    suggestedContentPillar: row.suggested_content_pillar,
    suggestedProductionType: row.suggested_production_type,
    topicConfidence: numberOrNull(row.topic_confidence),
    pillarConfidence: numberOrNull(row.pillar_confidence),
    productionTypeConfidence: numberOrNull(row.production_type_confidence),
    topicRationale: row.topic_rationale,
    pillarRationale: row.pillar_rationale,
    productionTypeRationale: row.production_type_rationale,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    sourceFingerprint: row.source_fingerprint,
    sourceMetadataSyncedAt: row.source_metadata_synced_at ? iso(row.source_metadata_synced_at) : null,
    status: row.status,
    acceptedFields: (row.accepted_fields ?? []).filter((field): field is ClassificationField =>
      field === "topic" || field === "content_pillar" || field === "production_type"),
    createdAt: iso(row.created_at),
    reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : null,
    stale: suggestionIsStale(row.source_fingerprint, currentFingerprint),
  };
}

export function sourceFromRow(row: ContextRow): ClassificationSource {
  const youtube: ClassificationYoutube | null = row.youtube_video_id
    ? {
        youtubeVideoId: row.youtube_video_id,
        title: row.source_title ?? "",
        description: row.description ?? "",
        tags: Array.isArray(row.tags) ? row.tags : [],
        categoryId: row.category_id,
        defaultLanguage: row.default_language,
        defaultAudioLanguage: row.default_audio_language,
        privacyStatus: row.privacy_status,
        metadataSyncedAt: row.metadata_synced_at ? iso(row.metadata_synced_at) : null,
      }
    : null;
  return {
    title: row.title,
    topic: row.topic,
    productionType: row.production_type,
    projectCode: row.project_code,
    youtube,
  };
}
