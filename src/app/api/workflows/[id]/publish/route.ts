import { retiredProductionResponse } from "@/lib/production/retired";

export const runtime = "nodejs";

export async function POST() {
  return retiredProductionResponse();
}
