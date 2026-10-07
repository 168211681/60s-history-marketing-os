import { NextResponse, type NextRequest } from "next/server";
import { requireAssetContext } from "@/lib/clipforge/asset-guard";
import { isScopedAssetPath, isUploadId, uploadAllowed, validMultipartParts } from "@/lib/clipforge/assets";
import { completeMultipartUpload } from "@/lib/clipforge/r2";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssetContext(request, id, true);
  if ("error" in access) return access.error;
  const body = await request.json().catch(() => null) as {
    storagePath?: unknown;
    uploadId?: unknown;
    parts?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  } | null;
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
  const uploadId = body?.uploadId;
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const sizeBytes = Number(body?.sizeBytes);
  const parts = validMultipartParts(body?.parts, sizeBytes);
  if (!uploadAllowed("master_video", mimeType, sizeBytes) || !isScopedAssetPath(storagePath, access.ownerId, id, "master_video") || !isUploadId(uploadId) || !parts) {
    return NextResponse.json({ error: "That master video upload is not complete." }, { status: 400 });
  }
  try {
    const completed = await completeMultipartUpload(storagePath, uploadId, parts);
    if (!completed) return NextResponse.json({ error: "Private storage could not finish the upload." }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "Private storage could not finish the upload." }, { status: 502 });
  }
  return NextResponse.json({ path: storagePath });
}
