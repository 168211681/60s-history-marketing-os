import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { updatePlatformPost } from "@/lib/clipforge/data";
import { isPlatform, parsePlatformPostPatch } from "@/lib/clipforge/distribution";
import { clipforgeError } from "@/lib/clipforge/http";
import { isUuid } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; platform: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id, platform } = await params;
  if (!isUuid(id) || !isPlatform(platform)) return NextResponse.json({ error: "Platform post was not found." }, { status: 404 });
  const patch = parsePlatformPostPatch(await request.json().catch(() => null));
  if (!patch) return NextResponse.json({ error: "Platform status, time, or URL is invalid." }, { status: 400 });
  try {
    const saved = await updatePlatformPost(owner.id, id, platform, patch);
    if (saved === undefined) return NextResponse.json({ error: "Scheduled posts need a time, and published posts need a time." }, { status: 400 });
    if (!saved) return NextResponse.json({ error: "Platform post was not found." }, { status: 404 });
    return NextResponse.json({ id: saved.id, status: saved.status });
  } catch (error) {
    return clipforgeError(error);
  }
}
