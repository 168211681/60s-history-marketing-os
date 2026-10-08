import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { previewBatchClassification } from "@/lib/clipforge/classification-store";
import { databaseConfigured } from "@/lib/database";

export async function POST(request: NextRequest) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const body = await request.json().catch(() => null);
  try {
    const result = await previewBatchClassification(owner.id, body);
    if (result.kind === "invalid") return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.kind === "missing") return NextResponse.json({ error: "Content item was not found." }, { status: 404 });
    return NextResponse.json(result.preview);
  } catch (error) {
    console.error("batch preview failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not preview that batch." }, { status: 500 });
  }
}
