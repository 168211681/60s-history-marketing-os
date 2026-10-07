import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { deleteAsset, getAsset } from "@/lib/clipforge/data";
import { isUuid } from "@/lib/clipforge/model";
import { r2Configured, removeStoredObject, signStoredObjects } from "@/lib/clipforge/r2";
import { databaseConfigured } from "@/lib/database";

async function ownedAsset(request: NextRequest, params: Promise<{ id: string; assetId: string }>, write: boolean) {
  if (write && (!appOrigin() || request.headers.get("origin") !== appOrigin())) {
    return { error: new Response("Forbidden", { status: 403 }) };
  }
  const owner = await currentOwner();
  if (!owner) return { error: new Response("Unauthorized", { status: 401 }) };
  if (!databaseConfigured()) return { error: new Response("Database is not configured", { status: 503 }) };
  if (!r2Configured()) return { error: NextResponse.json({ error: "Private file storage is not configured." }, { status: 503 }) };
  const { id, assetId } = await params;
  if (!isUuid(id) || !isUuid(assetId)) return { error: NextResponse.json({ error: "Asset was not found." }, { status: 404 }) };
  const asset = await getAsset(owner.id, id, assetId);
  if (!asset) return { error: NextResponse.json({ error: "Asset was not found." }, { status: 404 }) };
  return { ownerId: owner.id, contentItemId: id, asset };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; assetId: string }> }) {
  const result = await ownedAsset(request, context.params, false);
  if ("error" in result) return result.error;
  const urls = await signStoredObjects([result.asset.storagePath], 300);
  const url = urls.get(result.asset.storagePath);
  if (!url) return NextResponse.json({ error: "A private link could not be created." }, { status: 503 });
  return NextResponse.json({ url, expiresIn: 300 });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; assetId: string }> }) {
  const result = await ownedAsset(request, context.params, true);
  if ("error" in result) return result.error;
  const removed = await removeStoredObject(result.asset.storagePath);
  if (!removed) {
    return NextResponse.json({ error: "The stored file could not be removed, so the record was kept." }, { status: 502 });
  }
  const deleted = await deleteAsset(result.ownerId, result.contentItemId, result.asset.id);
  if (!deleted) {
    return NextResponse.json({
      error: `The file was removed from storage but the record remains. Orphan record ${result.asset.id}.`,
    }, { status: 500 });
  }
  return NextResponse.json({ id: deleted.id });
}
