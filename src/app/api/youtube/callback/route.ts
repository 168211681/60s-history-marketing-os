import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { sameSecret } from "@/lib/youtube/crypto";
import { exchangeCode, googleConfig, ownerChannel } from "@/lib/youtube/google";
import { databaseConfigured, saveConnection } from "@/lib/youtube/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || new URL(request.url).origin !== origin) return new Response("Connection origin is not configured", { status: 503 });
  const response = NextResponse.redirect(new URL("/settings?youtube=failed", origin));
  for (const name of ["yt_oauth_state", "yt_oauth_verifier", "yt_oauth_owner"]) {
    response.cookies.set(name, "", { path: "/api/youtube/callback", maxAge: 0 });
  }
  response.headers.set("Cache-Control", "private, no-store");

  const user = await currentOwner();
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const storedState = request.cookies.get("yt_oauth_state")?.value;
  const verifier = request.cookies.get("yt_oauth_verifier")?.value;
  const startedBy = request.cookies.get("yt_oauth_owner")?.value;
  if (!user || !state || !storedState || !sameSecret(state, storedState) ||
      !verifier || !/^[A-Za-z0-9_-]{43}$/.test(verifier) || startedBy !== user.id ||
      !code || code.length > 2048 || !googleConfig() || !databaseConfigured()) return response;

  try {
    const tokens = await exchangeCode(googleConfig()!, code, verifier);
    const channel = await ownerChannel(tokens.accessToken);
    await saveConnection(user.id, channel, tokens.refreshToken, tokens.scopes);
    response.headers.set("Location", new URL("/settings?youtube=connected", origin).toString());
  } catch {
    // Provider and database details are deliberately not reflected into the URL.
  }
  return response;
}
