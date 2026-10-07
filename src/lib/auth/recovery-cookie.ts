import "server-only";

export const recoveryCookieName = "clipforge_recovery";
export const recoveryCookieMaxAge = 600;

export type RecoveryCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/reset-password";
  maxAge: number;
};

type CookieWriter = {
  set: (name: string, value: string, options: RecoveryCookieOptions) => void;
};

export function recoveryCookieSecure(origin: string | null | undefined) {
  return Boolean(origin?.startsWith("https:"));
}

export function recoveryCookieOptions(secure: boolean, maxAge = recoveryCookieMaxAge): RecoveryCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/reset-password",
    maxAge,
  };
}

export function recoveryMarkerDecision(destination: string): "set" | "clear" {
  return destination === "/reset-password" ? "set" : "clear";
}

export function applyRecoveryMarker(response: CookieWriter, destination: string, secure: boolean) {
  const set = recoveryMarkerDecision(destination) === "set";
  response.set(recoveryCookieName, set ? "1" : "", recoveryCookieOptions(secure, set ? recoveryCookieMaxAge : 0));
}

export function clearRecoveryMarker(response: CookieWriter, secure: boolean) {
  response.set(recoveryCookieName, "", recoveryCookieOptions(secure, 0));
}

export function writeRecoveryDecision(response: CookieWriter, marker: "set" | "clear", secure: boolean) {
  if (marker === "set") applyRecoveryMarker(response, "/reset-password", secure);
  else clearRecoveryMarker(response, secure);
}

export function hasRecoveryMarker(value: string | null | undefined) {
  return value === "1";
}

export function resetPasswordAccess(input: { configured: boolean; owner: boolean; recoveryMarker: boolean }) {
  if (!input.configured) return "unconfigured" as const;
  if (!input.owner || !input.recoveryMarker) return "needs-link" as const;
  return "form" as const;
}
