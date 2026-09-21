import { retiredProductionResponse } from "@/lib/production/retired";

export const runtime = "nodejs";

/** Stable tombstone: old clients cannot create internal video jobs. */
export async function POST() {
  return retiredProductionResponse();
}
