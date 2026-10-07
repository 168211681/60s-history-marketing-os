import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { clipforgeError } from "@/lib/clipforge/http";
import { importYoutubeLibrary } from "@/lib/clipforge/import-youtube";
import { isUuid } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project was not found." }, { status: 404 });
  try {
    const imported = await importYoutubeLibrary(owner.id, id);
    if (!imported) return NextResponse.json({ error: "Project was not found." }, { status: 404 });
    return NextResponse.json(imported);
  } catch (error) {
    return clipforgeError(error);
  }
}
