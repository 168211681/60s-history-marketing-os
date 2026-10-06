import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, supabaseConfig } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import {
  assetBucket,
  buildAssetPath,
  isAssetKind,
  maxAssetBytes,
  mimeAllowed,
  resumableUploadEndpoint,
  uploadChunkBytes,
} from "@/lib/clipforge/assets";
import { listAssets, getContentItem } from "@/lib/clipforge/data";
import { isUuid } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const config = supabaseConfig();
  const endpoint = config ? resumableUploadEndpoint(config.url) : null;
  if (!endpoint) return NextResponse.json({ error: "Resumable storage upload is not configured." }, { status: 503 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Content item was not found." }, { status: 404 });
  const item = await getContentItem(owner.id, id);
  if (!item) return NextResponse.json({ error: "Content item was not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { kind?: unknown; filename?: unknown; mimeType?: unknown; sizeBytes?: unknown } | null;
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const sizeBytes = Number(body?.sizeBytes);
  if (!isAssetKind(kind) || !mimeAllowed(kind, mimeType) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxAssetBytes) {
    return NextResponse.json({ error: "Choose an allowed video or image within 512 MB." }, { status: 400 });
  }
  const existing = await listAssets(owner.id, id);
  if (existing.some((asset) => asset.kind === kind)) {
    return NextResponse.json({ error: "Delete the current file before uploading another." }, { status: 409 });
  }
  const path = buildAssetPath(owner.id, id, kind, filename);
  if (!path) return NextResponse.json({ error: "Could not create a storage path." }, { status: 400 });
  return NextResponse.json({
    bucket: assetBucket,
    path,
    endpoint,
    chunkSize: uploadChunkBytes,
  });
}
