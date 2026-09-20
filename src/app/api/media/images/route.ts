import { NextResponse } from "next/server";
import { currentOwner } from "@/lib/auth/server";
import { deleteImageAsset, listImageAssets, uploadImageAsset } from "@/lib/media/assets";

export const runtime = "nodejs";

export async function GET() {
  const owner = await currentOwner();
  // Listing an empty collection for anonymous users keeps the public scripts
  // page honest without exposing private assets; writes remain authenticated.
  if (!owner) return NextResponse.json({ assets: [], authenticated: false }, { headers: { "Cache-Control": "private, no-store" } });
  try {
    return NextResponse.json({ assets: await listImageAssets(owner.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("image asset list failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "IMAGE_ASSET_LIST_FAILED" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "IMAGE_FILE_REQUIRED" }, { status: 400 });
  try {
    const asset = await uploadImageAsset(owner.id, new Uint8Array(await file.arrayBuffer()), file.type);
    return NextResponse.json({ asset }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "IMAGE_ASSET_UPLOAD_FAILED";
    console.error("image asset upload failed", { code });
    return NextResponse.json({ error: code }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "IMAGE_PATH_REQUIRED" }, { status: 400 });
  }
  const path = typeof payload === "object" && payload !== null && "path" in payload && typeof payload.path === "string" ? payload.path : null;
  if (!path) return NextResponse.json({ error: "IMAGE_PATH_REQUIRED" }, { status: 400 });
  try {
    await deleteImageAsset(owner.id, path);
    return NextResponse.json({ deleted: path }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "IMAGE_ASSET_DELETE_FAILED";
    console.error("image asset delete failed", { code });
    return NextResponse.json({ error: code }, { status: code === "IMAGE_ASSET_INVALID_PATH" ? 400 : 502 });
  }
}
