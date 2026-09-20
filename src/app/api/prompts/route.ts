import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { contentGenerationPrompt, marketSnapshot, ownerContext } from "@/lib/ai/mcp-data";

export const runtime = "nodejs";
const schema = z.object({ topic: z.string().trim().min(1).max(500), goal: z.string().trim().max(1000).optional(), language: z.enum(["th", "en"]).default("th") });

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  if (!await currentOwner()) return new Response("Unauthorized", { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid prompt request" }, { status: 400 });
  try {
    const context = await ownerContext();
    const prompt = contentGenerationPrompt(context, parsed.data, await marketSnapshot(context));
    return NextResponse.json(prompt, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PROMPT_GENERATION_FAILED";
    return NextResponse.json({ error: code }, { status: 503 });
  }
}
