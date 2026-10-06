import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { createProject } from "@/lib/clipforge/data";
import { clipforgeError } from "@/lib/clipforge/http";
import { parseProjectInput } from "@/lib/clipforge/model";
import { databaseConfigured } from "@/lib/database";

export async function POST(request: NextRequest) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const input = parseProjectInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Project name, code, or status is invalid." }, { status: 400 });
  try {
    const project = await createProject(owner.id, input);
    return NextResponse.json({ id: project.id }, { status: 201 });
  } catch (error) {
    return clipforgeError(error);
  }
}
