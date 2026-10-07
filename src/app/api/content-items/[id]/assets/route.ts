import { NextResponse, type NextRequest } from "next/server";
import { requireAssetContext } from "@/lib/clipforge/asset-guard";
import { isScopedAssetPath, uploadAllowed } from "@/lib/clipforge/assets";
import { commitUploadedAsset } from "@/lib/clipforge/commit-asset";
import { createAsset } from "@/lib/clipforge/data";
import { clipforgeError } from "@/lib/clipforge/http";
import { headStoredObject, removeStoredObject } from "@/lib/clipforge/r2";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssetContext(request, id, true);
  if ("error" in access) return access.error;
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
  if (!uploadAllowed(kind, mimeType, sizeBytes) || !isScopedAssetPath(storagePath, access.ownerId, id, kind)) {
    return NextResponse.json({ error: "The uploaded file is outside this content item." }, { status: 400 });
  }
  if (!originalFilename || originalFilename.length > 180 || /[/\\\0]/.test(originalFilename)) {
    return NextResponse.json({ error: "The original filename is not usable." }, { status: 400 });
  }
  try {
    const saved = await commitUploadedAsset(
      { inspect: headStoredObject, remove: removeStoredObject },
      storagePath,
      sizeBytes,
      mimeType,
      () => createAsset(access.ownerId, id, { kind, storagePath, originalFilename, mimeType, sizeBytes }),
    );
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ id: saved.id }, { status: 201 });
  } catch (error) {
    return clipforgeError(error);
  }
}
