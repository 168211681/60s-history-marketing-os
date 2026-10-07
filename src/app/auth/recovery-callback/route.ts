import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, ownerId } from "@/lib/auth/config";
import { clearRecoveryMarker, recoveryCookieSecure, writeRecoveryDecision } from "@/lib/auth/recovery-cookie";
import { recoveryCallbackGrant } from "@/lib/auth/recovery";
import { serverAuth } from "@/lib/auth/server";

function finish(
  origin: string,
  destination: string,
  marker: "set" | "clear",
  response = NextResponse.redirect(new URL(destination, origin)),
) {
  response.headers.set("Location", new URL(destination, origin).toString());
  response.headers.set("Cache-Control", "private, no-store");
  writeRecoveryDecision(response.cookies, marker, recoveryCookieSecure(origin));
  return response;
}

export async function GET(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || new URL(request.url).origin !== origin) {
    const response = new NextResponse("Authentication origin is not configured", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
    clearRecoveryMarker(response.cookies, recoveryCookieSecure(origin));
    return response;
  }
  const code = request.nextUrl.searchParams.get("code");
  const response = NextResponse.redirect(new URL("/settings", origin));
  const client = await serverAuth(response);
  try {
    const grant = await recoveryCallbackGrant(client ? client.auth : null, { code, ownerId: ownerId() });
    return finish(origin, grant.destination, grant.marker, response);
  } catch {
    return finish(origin, "/settings?auth_error=recovery", "clear", response);
  }
}
