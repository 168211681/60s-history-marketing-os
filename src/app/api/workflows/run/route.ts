import { NextRequest } from "next/server";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { GET as productionWorker } from "@/app/api/cron/production-workflow/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!await currentOwner()) return new Response("Unauthorized", { status: 401 });
  if (!databaseConfigured() || !process.env.CRON_SECRET) return new Response("Worker is not configured", { status: 503 });
  const workerRequest = new NextRequest(new URL("/api/cron/production-workflow", request.url), {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  return productionWorker(workerRequest);
}
