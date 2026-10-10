import { NextResponse, type NextRequest } from "next/server";
import { parseBulkConfirmation, parseBulkSelection } from "./bulk-review";
import { BulkReviewConflict } from "./bulk-review-store";

type Dependencies = {
  origin: () => string | null;
  owner: () => Promise<{ id: string } | null>;
  configured: () => boolean;
  preview: (ownerId: string, body: unknown) => Promise<unknown>;
  confirm: (ownerId: string, body: unknown) => Promise<unknown>;
};
// Shared by both endpoints; injectable dependencies allow actual handler tests
// without manufacturing an owner session or calling a hosted service.
export async function bulkReviewPost(request: NextRequest, confirm: boolean, deps: Dependencies) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const origin = deps.origin();
  if (!origin || request.headers.get("origin") !== origin) return json({ error: "Forbidden" }, 403);
  const owner = await deps.owner();
  if (!owner) return json({ error: "Unauthorized" }, 401);
  if (!deps.configured()) return json({ error: "Database is not configured" }, 503);
  const text = await request.text();
  if (text.length > 16000) return json({ error: "Batch payload is too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: "Invalid batch payload." }, 400); }
  const parsed = confirm ? parseBulkConfirmation(body) : parseBulkSelection(body);
  if (!parsed) return json({ error: "Choose 1–10 different clips and valid fields. Preview before confirming." }, 400);
  try {
    return json(await (confirm ? deps.confirm : deps.preview)(owner.id, parsed));
  } catch (error) {
    if (error instanceof BulkReviewConflict) return json({ error: error.message, conflict: true }, 409);
    // No SQL, credentials, provider output, or foreign-record details escape.
    return json({ error: confirm ? "The batch outcome could not be verified. Retry this same confirmation to check safely." : "Could not load the preview. Try again." }, 503);
  }
}
