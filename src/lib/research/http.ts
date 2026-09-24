import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";

export async function researchRequest(request: NextRequest, write = false) {
  if (write && (!appOrigin() || request.headers.get("origin") !== appOrigin()))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const owner = await currentOwner();
  if (!owner) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!databaseConfigured()) return { error: NextResponse.json({ error: "Database is not configured" }, { status: 503 }) };
  return { ownerId: owner.id };
}

export const privateHeaders = { "Cache-Control": "private, no-store" };
