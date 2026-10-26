import type { NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { bulkReviewPost } from "@/lib/clipforge/bulk-review-http";
import { getBulkReviewPreview, commitBulkReview } from "@/lib/clipforge/bulk-review-store";

export function POST(request: NextRequest) {
  return bulkReviewPost(request, true, { origin: appOrigin, owner: currentOwner, configured: databaseConfigured, preview: getBulkReviewPreview, confirm: commitBulkReview });
}
