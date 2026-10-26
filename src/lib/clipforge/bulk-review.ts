import { z } from "zod";
import type { ClassificationField } from "./classification";
import type { ReviewItem, ReviewSuggestion } from "./review-queue";

export const BULK_REVIEW_LIMIT = 10;
export const bulkFields = ["topic", "content_pillar", "production_type"] as const;
export const bulkFieldLabels = { topic: "Topic", content_pillar: "Content pillar", production_type: "Production type" };
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).transform((v) => v.toLowerCase());
const version = z.string().regex(/^[0-9a-f]{64}$/);
const fields = z.array(z.enum(bulkFields)).max(3).refine((v) => new Set(v).size === v.length)
  .transform((v) => bulkFields.filter((field) => v.includes(field)));
const entry = z.object({ contentItemId: uuid, fields, suggestionId: uuid.optional(), version: version.optional() }).strict()
  .refine((v) => Boolean(v.suggestionId) === Boolean(v.version));
const selection = z.object({ action: z.enum(["accept", "reject"]), items: z.array(entry).min(1).max(BULK_REVIEW_LIMIT) }).strict();
const confirmation = z.object({ requestId: uuid, action: z.enum(["accept", "reject"]), items: z.array(z.object({ contentItemId: uuid, suggestionId: uuid, version, fields }).strict()).min(1).max(BULK_REVIEW_LIMIT) }).strict();
export type BulkSelection = z.infer<typeof selection>;
export type BulkConfirmation = z.infer<typeof confirmation>;
function uniqueItems(value: BulkSelection) {
  return new Set(value.items.map((v) => v.contentItemId)).size === value.items.length
    && new Set(value.items.flatMap((v) => v.suggestionId ? [v.suggestionId] : [])).size === value.items.filter((v) => v.suggestionId).length
    && value.items.every((v) => value.action === "accept" || v.fields.length === 0);
}
export function parseBulkSelection(value: unknown): BulkSelection | null {
  const parsed = selection.safeParse(value);
  return parsed.success && uniqueItems(parsed.data) ? parsed.data : null;
}
export function parseBulkConfirmation(value: unknown): BulkConfirmation | null {
  const parsed = confirmation.safeParse(value);
  return parsed.success && uniqueItems(parsed.data) && parsed.data.items.every((v) => parsed.data.action === "reject" || v.fields.length > 0) ? parsed.data : null;
}
export function bulkEligible(item: ReviewItem) {
  return item.state === "pending" && item.suggestion?.status === "pending" && !item.suggestion.stale;
}
export type BulkPreviewItem = {
  contentItemId: string; title: string; projectName: string;
  current: Record<ClassificationField, string>;
  suggestionId: string | null; version: string; suggestion: ReviewSuggestion | null;
  fields: ClassificationField[]; availableFields: ClassificationField[];
  eligible: boolean; warnings: string[];
};
export type BulkPreview = { requestId: string; action: "accept" | "reject"; items: BulkPreviewItem[]; affected: number; canConfirm: boolean };
export type BulkOutcome = { requestId: string; action: "accept" | "reject"; affected: number; completedAt: string; replayed: boolean };
