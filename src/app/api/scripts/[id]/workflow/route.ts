import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { createProductionWorkflow, ownerContext } from "@/lib/ai/mcp-data";
import { databaseConfigured } from "@/lib/database";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!appOrigin() || request.headers.get("origin") !== appOrigin()) return new Response("Forbidden", { status: 403 });
  if (!await currentOwner()) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  try { return NextResponse.json({ workflow: await createProductionWorkflow(await ownerContext(), id) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start workflow" }, { status: 409 }); }
}
