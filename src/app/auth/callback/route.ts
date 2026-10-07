import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, ownerId } from "@/lib/auth/config";
import { callbackDestination } from "@/lib/auth/recovery";
import { serverAuth } from "@/lib/auth/server";

function redirectTo(origin: string, path: string, response = NextResponse.redirect(new URL(path, origin))) {
  response.headers.set("Location", new URL(path, origin).toString());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || new URL(request.url).origin !== origin) {
    return new Response("Authentication origin is not configured", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  if (!code || code.length > 2048 || /[\u0000\r\n]/.test(code)) {
    return redirectTo(origin, "/settings?auth_error=callback");
  }
  const response = NextResponse.redirect(new URL("/settings", origin));
  const client = await serverAuth(response);
  if (!client) return redirectTo(origin, "/settings?auth_error=callback");
  try {
    const exchanged = await client.auth.exchangeCodeForSession(code);
    if (exchanged.error) return redirectTo(origin, "/settings?auth_error=callback", response);
    const { data } = await client.auth.getUser();
    const ownerMatches = Boolean(data.user && ownerId() && data.user.id.toLowerCase() === ownerId());
    if (!ownerMatches) await client.auth.signOut();
    return redirectTo(origin, callbackDestination({ code, next, exchanged: true, ownerMatches }), response);
  } catch {
    return redirectTo(origin, "/settings?auth_error=callback", response);
  }
}
