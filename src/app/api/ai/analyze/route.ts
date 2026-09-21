import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { aiProvider } from "@/lib/ai/provider";
import { ownerContext } from "@/lib/ai/mcp-data";
import { buildMarketingInsights } from "@/lib/insights";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  if (!await currentOwner()) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const provider = aiProvider();
  if (!provider.configured) return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  try {
    const context = await ownerContext();
    const result = await provider.analyze({
      channel: context.channelTitle,
      period: context.period,
      summary: context.workspace.summary,
      videos: context.workspace.videos,
      calculatedInsights: buildMarketingInsights(context.workspace.videos),
    });
    return NextResponse.json({ source: provider.name, period: context.period, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "AI_PROVIDER_FAILED" }, { status: 502 });
  }
}
