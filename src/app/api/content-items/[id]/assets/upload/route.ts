import { NextResponse, type NextRequest } from "next/server";
import { requireAssetContext } from "@/lib/clipforge/asset-guard";
import { buildAssetPath, multipartPlan, uploadAllowed } from "@/lib/clipforge/assets";
import { listAssets } from "@/lib/clipforge/data";
import { signPutObject, startMultipartUpload } from "@/lib/clipforge/r2";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssetContext(request, id, true);
  if ("error" in access) return access.error;
  const body = await request.json().catch(() => null) as { kind?: unknown; filename?: unknown; mimeType?: unknown; sizeBytes?: unknown } | null;
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const sizeBytes = Number(body?.sizeBytes);
  if (!uploadAllowed(kind, mimeType, sizeBytes)) {
    return NextResponse.json({ error: "Choose an allowed video or image within 512 MB." }, { status: 400 });
  }
  const existing = await listAssets(access.ownerId, id);
  if (existing.some((asset) => asset.kind === kind)) {
    return NextResponse.json({ error: "Delete the current file before uploading another." }, { status: 409 });
  }
  const path = buildAssetPath(access.ownerId, id, kind, filename);
  if (!path) return NextResponse.json({ error: "Could not create a storage path." }, { status: 400 });
  if (kind === "master_video") {
    const uploadId = await startMultipartUpload(path, mimeType);
    const plan = multipartPlan(sizeBytes);
    if (!uploadId || !plan) return NextResponse.json({ error: "Private upload could not start." }, { status: 503 });
    return NextResponse.json({ mode: "multipart", path, uploadId, partSize: plan.partSize, partCount: plan.partCount });
  }
  const url = await signPutObject(path, mimeType, sizeBytes);
  if (!url) return NextResponse.json({ error: "Private upload could not start." }, { status: 503 });
  return NextResponse.json({ mode: "put", path, url, contentType: mimeType });
}
