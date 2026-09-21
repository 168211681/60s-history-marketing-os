import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { removeConnection } from "@/lib/youtube/store";
import { revokeToken } from "@/lib/youtube/google";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = appOrigin();
  if (!origin || request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403 });
  const user = await currentOwner();
  if (!user) return new Response("Unauthorized", { status: 401 });
  let token: string | null;
  try {
    token = await removeConnection(user.id);
  } catch {
    return new Response("Disconnect failed", { status: 503 });
  }
  let status = "disconnected";
  if (token) {
    try {
      if (!(await revokeToken(token))) status = "revocation-pending";
    } catch {
      status = "revocation-pending";
    }
  }
  const response = NextResponse.redirect(new URL(`/settings?youtube=${status}`, origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
