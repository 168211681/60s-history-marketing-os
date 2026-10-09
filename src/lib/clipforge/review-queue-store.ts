import "server-only";
import { transaction } from "@/lib/database";
import { readReviewQueue } from "./review-queue-read";
import type { ReviewFilters } from "./review-queue";

export function getReviewQueue(ownerId: string, filters: ReviewFilters) {
  return transaction((client) => readReviewQueue(client, ownerId, filters));
}
