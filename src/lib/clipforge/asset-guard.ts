import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { getContentItem } from "./data";
import { isUuid } from "./model";
import { r2Configured } from "./r2";

export async function requireAssetContext(request: NextRequest, contentItemId: string, write: boolean) {
  if (write && (!appOrigin() || request.headers.get("origin") !== appOrigin())) {
    return { error: new Response("Forbidden", { status: 403 }) };
  }
  const owner = await currentOwner();
  if (!owner) return { error: new Response("Unauthorized", { status: 401 }) };
  if (!databaseConfigured()) return { error: new Response("Database is not configured", { status: 503 }) };
  if (!r2Configured()) return { error: NextResponse.json({ error: "Private file storage is not configured." }, { status: 503 }) };
  if (!isUuid(contentItemId)) return { error: NextResponse.json({ error: "Content item was not found." }, { status: 404 }) };
  const item = await getContentItem(owner.id, contentItemId);
  if (!item) return { error: NextResponse.json({ error: "Content item was not found." }, { status: 404 }) };
  return { ownerId: owner.id };
}
