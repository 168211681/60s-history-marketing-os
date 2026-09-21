import { retiredProductionResponse } from "@/lib/production/retired";

export const runtime = "nodejs";

/** Stable tombstone: scheduled production work is retired and never calls a provider. */
export async function GET() {
  return retiredProductionResponse();
}
