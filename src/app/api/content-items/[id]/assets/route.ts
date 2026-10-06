import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { isAssetKind, isScopedAssetPath, maxAssetBytes, mimeAllowed } from "@/lib/clipforge/assets";
import { createAsset } from "@/lib/clipforge/data";
import { clipforgeError } from "@/lib/clipforge/http";
import { isUuid } from "@/lib/clipforge/model";
import { removeStoredObject, storageAdminConfigured, storedObjectExists } from "@/lib/clipforge/storage";
import { databaseConfigured } from "@/lib/database";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  if (!storageAdminConfigured()) return NextResponse.json({ error: "Storage admin is not configured, so the upload was not recorded." }, { status: 503 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Content item was not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as {
    kind?: unknown;
    storagePath?: unknown;
    originalFilename?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  } | null;
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
  const originalFilename = typeof body?.originalFilename === "string" ? body.originalFilename.trim() : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const sizeBytes = Number(body?.sizeBytes);
  if (!isAssetKind(kind) || !isScopedAssetPath(storagePath, owner.id, id, kind) || !mimeAllowed(kind, mimeType)) {
    return NextResponse.json({ error: "The uploaded file is outside this content item." }, { status: 400 });
  }
  if (!originalFilename || originalFilename.length > 180 || /[/\\\0]/.test(originalFilename)) {
    return NextResponse.json({ error: "The original filename is not usable." }, { status: 400 });
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxAssetBytes) {
    return NextResponse.json({ error: "Choose an allowed video or image within 512 MB." }, { status: 400 });
  }
  const exists = await storedObjectExists(storagePath);
  if (exists === null) return NextResponse.json({ error: "Storage could not be checked." }, { status: 503 });
  if (!exists) return NextResponse.json({ error: "The upload did not finish in storage, so no record was saved." }, { status: 409 });
  try {
    const saved = await createAsset(owner.id, id, { kind, storagePath, originalFilename, mimeType, sizeBytes });
    if (!saved) {
      await removeStoredObject(storagePath);
      return NextResponse.json({ error: "Content item was not found. The uploaded object was removed." }, { status: 404 });
    }
    return NextResponse.json({ id: saved.id }, { status: 201 });
  } catch (error) {
    const removed = await removeStoredObject(storagePath);
    if (!removed) {
      return NextResponse.json({
        error: `The file reached storage but the record was not saved. Orphan object remains at ${storagePath}.`,
      }, { status: 500 });
    }
    return clipforgeError(error);
  }
}
