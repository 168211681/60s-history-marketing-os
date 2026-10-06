import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { createContentItem } from "@/lib/clipforge/data";
import { clipforgeError } from "@/lib/clipforge/http";
import { parseContentInput } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export async function POST(request: NextRequest) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const input = parseContentInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Content title, project, or status is invalid." }, { status: 400 });
  try {
    const item = await createContentItem(owner.id, input);
    if (!item) return NextResponse.json({ error: "Choose one of your projects." }, { status: 404 });
    return NextResponse.json({ id: item.id }, { status: 201 });
  } catch (error) {
    return clipforgeError(error);
  }
}
