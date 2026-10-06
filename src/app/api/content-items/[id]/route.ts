import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { updateContentItem } from "@/lib/clipforge/data";
import { clipforgeError } from "@/lib/clipforge/http";
import { isUuid, parseContentPatch } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Content item was not found." }, { status: 404 });
  const input = parseContentPatch(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Content title, project, or status is invalid." }, { status: 400 });
  try {
    const item = await updateContentItem(owner.id, id, input);
    if (!item) return NextResponse.json({ error: "Content item was not found." }, { status: 404 });
    return NextResponse.json({ id: item.id });
  } catch (error) {
    return clipforgeError(error);
  }
}
