import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { classifyContentItem } from "@/lib/clipforge/classification-store";
import { isUuid } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Content item was not found." }, { status: 404 });
  try {
    const result = await classifyContentItem(owner.id, id);
    if (result.kind === "missing") return NextResponse.json({ error: "Content item was not found." }, { status: 404 });
    if (result.kind === "unconfigured") {
      return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
    }
    if (result.kind === "input_changed") {
      return NextResponse.json({ error: "CLASSIFICATION_INPUT_CHANGED" }, { status: 409 });
    }
    return NextResponse.json({ suggestion: result.suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "AI_NOT_CONFIGURED") return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (message === "AI_INVALID_RESPONSE" || message === "AI_INVALID_JSON") {
      return NextResponse.json({ error: message }, { status: 502 });
    }
    console.error("classification failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The classifier returned an unusable result." }, { status: 502 });
  }
}
