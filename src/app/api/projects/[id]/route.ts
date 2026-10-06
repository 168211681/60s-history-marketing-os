import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { updateProject } from "@/lib/clipforge/data";
import { clipforgeError } from "@/lib/clipforge/http";
import { isUuid, parseProjectPatch } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project was not found." }, { status: 404 });
  const input = parseProjectPatch(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Project name, code, or status is invalid." }, { status: 400 });
  try {
    const project = await updateProject(owner.id, id, input);
    if (!project) return NextResponse.json({ error: "Project was not found." }, { status: 404 });
    return NextResponse.json({ id: project.id });
  } catch (error) {
    return clipforgeError(error);
  }
}
