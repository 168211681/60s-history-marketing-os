"use server";

import { cookies } from "next/headers";
import { appOrigin } from "@/lib/auth/config";
import { applyRecoveryMarker, recoveryCookieSecure } from "@/lib/auth/recovery-cookie";

export async function clearPasswordRecoveryMarker() {
  const store = await cookies();
  applyRecoveryMarker(store, "/settings", recoveryCookieSecure(appOrigin()));
}
