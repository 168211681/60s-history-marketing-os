import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { googleConfig, newOAuthState, authorizationUrl } from "@/lib/youtube/google";
import { databaseConfigured } from "@/lib/youtube/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const user = await currentOwner();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const google = googleConfig();
  if (!google || !databaseConfigured()) return new Response("Connection is not configured", { status: 503 });

  const { state, verifier } = newOAuthState();
  const response = NextResponse.redirect(authorizationUrl(google, state, verifier), 303);
  const cookieOptions = { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax" as const, path: "/api/youtube/callback", maxAge: 600 };
  response.cookies.set("yt_oauth_state", state, cookieOptions);
  response.cookies.set("yt_oauth_verifier", verifier, cookieOptions);
  response.cookies.set("yt_oauth_owner", user.id, cookieOptions);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
