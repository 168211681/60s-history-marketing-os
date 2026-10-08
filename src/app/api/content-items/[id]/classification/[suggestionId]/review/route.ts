import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { reviewContentSuggestion } from "@/lib/clipforge/classification-store";
import { clipforgeError } from "@/lib/clipforge/http";
import { isUuid } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

function reviewBody(value: unknown): { action: "accept" | "reject"; fields: string[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as { action?: unknown; fields?: unknown };
  const action = body.action;
  if (action !== "accept" && action !== "reject") return null;
  const fields: string[] = [];
  if (action === "accept") {
    if (!Array.isArray(body.fields)) return null;
    for (const field of body.fields) {
      if (typeof field !== "string") return null;
      fields.push(field);
    }
  }
  return { action, fields };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; suggestionId: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id, suggestionId } = await params;
  if (!isUuid(id) || !isUuid(suggestionId)) return NextResponse.json({ error: "Suggestion was not found." }, { status: 404 });
  const body = reviewBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Choose accept or reject." }, { status: 400 });
  try {
    const result = await reviewContentSuggestion(owner.id, id, suggestionId, body.action, body.fields);
    if (result.kind === "missing") return NextResponse.json({ error: "Suggestion was not found." }, { status: 404 });
    if (result.kind === "invalid") return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ suggestion: result.suggestion });
  } catch (error) {
    return clipforgeError(error);
  }
}
