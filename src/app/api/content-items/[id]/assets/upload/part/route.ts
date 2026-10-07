import { NextResponse, type NextRequest } from "next/server";
import { requireAssetContext } from "@/lib/clipforge/asset-guard";
import { isAllowedPart, isScopedAssetPath, isUploadId } from "@/lib/clipforge/assets";
import { signUploadPart } from "@/lib/clipforge/r2";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssetContext(request, id, true);
  if ("error" in access) return access.error;
  const body = await request.json().catch(() => null) as {
    storagePath?: unknown;
    uploadId?: unknown;
    partNumber?: unknown;
    sizeBytes?: unknown;
  } | null;
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
  const uploadId = body?.uploadId;
  const sizeBytes = Number(body?.sizeBytes);
  const partNumber = Number(body?.partNumber);
  if (!isScopedAssetPath(storagePath, access.ownerId, id, "master_video") || !isUploadId(uploadId) || !isAllowedPart(partNumber, sizeBytes)) {
    return NextResponse.json({ error: "That upload part is outside this master video." }, { status: 400 });
  }
  const url = await signUploadPart(storagePath, uploadId, partNumber);
  if (!url) return NextResponse.json({ error: "Private upload could not continue." }, { status: 503 });
  return NextResponse.json({ url, partNumber });
}
