import { NextResponse } from "next/server";
import { currentOwner } from "@/lib/auth/server";
import { listImageAssets, uploadImageAsset } from "@/lib/media/assets";

export const runtime = "nodejs";

export async function GET() {
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
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
