import { NextResponse, type NextRequest } from "next/server";
import { requireAssetContext } from "@/lib/clipforge/asset-guard";
import { isScopedAssetPath, isUploadId } from "@/lib/clipforge/assets";
import { abortMultipartUpload } from "@/lib/clipforge/r2";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssetContext(request, id, true);
  if ("error" in access) return access.error;
  const body = await request.json().catch(() => null) as { storagePath?: unknown; uploadId?: unknown } | null;
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
  const uploadId = body?.uploadId;
  if (!isScopedAssetPath(storagePath, access.ownerId, id, "master_video") || !isUploadId(uploadId)) {
    return NextResponse.json({ error: "That upload could not be cancelled." }, { status: 400 });
  }
  const aborted = await abortMultipartUpload(storagePath, uploadId);
  if (!aborted) return NextResponse.json({ error: "The unfinished upload could not be cancelled." }, { status: 502 });
  return NextResponse.json({ path: storagePath });
}
