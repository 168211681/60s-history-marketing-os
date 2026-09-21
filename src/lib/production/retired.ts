import { NextResponse } from "next/server";

export const PRODUCTION_RETIRED_CODE = "PRODUCTION_RETIRED";

export function retiredProductionResponse() {
  return NextResponse.json(
    {
      error: PRODUCTION_RETIRED_CODE,
      message: "Internal video rendering, upload, and publishing are archived. Export a creative brief for an external editing tool instead.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
