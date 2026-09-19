import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, ownerId } from "@/lib/auth/config";
import { serverAuth } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || new URL(request.url).origin !== origin) {
    return new Response("Authentication origin is not configured", { status: 503 });
  }
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 2048) return NextResponse.redirect(new URL("/settings?auth=failed", origin));

  const response = NextResponse.redirect(new URL("/settings", origin));
  const client = await serverAuth(response);
  if (!client) return NextResponse.redirect(new URL("/settings?auth=unavailable", origin));
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/settings?auth=failed", origin));

  const { data } = await client.auth.getUser();
  if (data.user?.id.toLowerCase() !== ownerId()) {
    await client.auth.signOut();
    response.headers.set("Location", new URL("/settings?auth=denied", origin).toString());
  }
  return response;
}
