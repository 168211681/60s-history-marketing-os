import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { syncTrackedMarketChannel } from "@/lib/ai/mcp-data";

export const runtime = "nodejs";
const schema = z.object({ youtubeChannelId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/) });

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const owner = await currentOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured()) return new Response("Database is not configured", { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid YouTube channel ID" }, { status: 400 });
  try {
    const result = await syncTrackedMarketChannel({ ownerId: owner.id }, parsed.data.youtubeChannelId);
    return NextResponse.json({ channel: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "MARKET_SYNC_FAILED";
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
