import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { aiProvider } from "@/lib/ai/provider";
import { ownerContext, saveScriptDraft } from "@/lib/ai/mcp-data";

export const runtime = "nodejs";

const inputSchema = z.object({
  topic: z.string().trim().min(1).max(2000),
  angle: z.string().trim().max(4000).default(""),
  evidence: z.string().trim().max(10000).default(""),
  researchNotes: z.string().trim().max(10000).default(""),
});

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  if (!await currentOwner()) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  const provider = aiProvider();
  if (!provider.configured) return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  try {
    const draft = await provider.draftScript(parsed.data);
    const saved = await saveScriptDraft(await ownerContext(), { ...draft, source: "ai_provider", modelIdentifier: provider.name });
    return NextResponse.json({ source: provider.name, approval: "human_required", draft: saved }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "AI_PROVIDER_FAILED" }, { status: 502 });
  }
}
