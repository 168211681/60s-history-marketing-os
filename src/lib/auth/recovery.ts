export const minPasswordLength = 12;
const allowedNext = new Set(["/settings"]);

export function safeAuthNext(next: string | null | undefined) {
  if (next && allowedNext.has(next)) return next;
  return "/settings";
}

export function callbackDestination(input: {
  code: string | null;
  next: string | null;
  exchanged: boolean;
  ownerMatches: boolean;
}) {
  if (!input.code || input.code.length > 2048 || /[\u0000\r\n]/.test(input.code)) return "/settings?auth_error=callback";
  if (!input.exchanged || !input.ownerMatches) {
    return input.exchanged ? "/settings?auth=denied" : "/settings?auth_error=callback";
  }
  return safeAuthNext(input.next);
}

export function recoveryRedirect(origin: string) {
  return new URL("/auth/recovery-callback", origin).toString();
}

export function validAuthCode(code: string | null): code is string {
  return Boolean(code && code.length <= 2048 && !/[\u0000\r\n]/.test(code));
}

const recoveryFailure = "/settings?auth_error=recovery" as const;

export async function recoveryCallbackGrant(
  auth: {
    exchangeCodeForSession: (code: string) => Promise<{ error: { message?: string } | null }>;
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
    signOut: () => Promise<unknown>;
  } | null,
  input: { code: string | null; ownerId: string | null },
) {
  if (!validAuthCode(input.code) || !auth || !input.ownerId) {
    return { destination: recoveryFailure, marker: "clear" as const };
  }
  try {
    const exchanged = await auth.exchangeCodeForSession(input.code);
    if (exchanged.error) return { destination: recoveryFailure, marker: "clear" as const };
    const { data } = await auth.getUser();
    const ownerMatches = Boolean(data.user && data.user.id.toLowerCase() === input.ownerId.toLowerCase());
    if (!ownerMatches) {
      await auth.signOut();
      return { destination: recoveryFailure, marker: "clear" as const };
    }
    return { destination: "/reset-password" as const, marker: "set" as const };
  } catch {
    return { destination: recoveryFailure, marker: "clear" as const };
  }
}

export function recoveryRequestMessage() {
  return "If that account exists, a password reset link has been sent.";
}

export function signInFailureMessage(kind: "credentials" | "setup") {
  return kind === "credentials"
    ? "Email or password is incorrect."
    : "Sign-in could not start. Check the authentication setup.";
}

export function passwordSignInMessage(error: { code?: string; message?: string }) {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || message === "invalid login credentials") return signInFailureMessage("credentials");
  return signInFailureMessage("setup");
}

export function validateNewPassword(password: string, confirm: string) {
  if (password.length < minPasswordLength) return `Use at least ${minPasswordLength} characters.`;
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export async function changeOwnerPassword(
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
    updateUser: (input: { password: string }) => Promise<{ error: { message?: string } | null }>;
  },
  input: { password: string; confirm: string; ownerId: string | null },
) {
  const invalid = validateNewPassword(input.password, input.confirm);
  if (invalid) return { ok: false as const, error: invalid };
  const { data } = await auth.getUser();
  if (!data.user || !input.ownerId || data.user.id.toLowerCase() !== input.ownerId.toLowerCase()) {
    return { ok: false as const, error: "Open the password reset link again, then choose a new password." };
  }
  const updated = await auth.updateUser({ password: input.password });
  if (updated.error) {
    return { ok: false as const, error: "The password could not be changed. Request a new reset link and try again." };
  }
  return { ok: true as const, redirect: "/settings?password_reset=success" as const };
}

const resetFailure = "The password could not be changed. Request a new reset link and try again.";

export async function completeOwnerPasswordReset(
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
    updateUser: (input: { password: string }) => Promise<{ error: { message?: string } | null }>;
    signOut: () => Promise<unknown>;
  },
  input: { password: string; confirm: string; ownerId: string | null },
  clearMarker: () => Promise<void>,
) {
  const updated = await changeOwnerPassword(auth, input);
  if (!updated.ok) return updated;
  try {
    await clearMarker();
  } catch {
    try {
      await auth.signOut();
    } catch {
      // The password is already changed. End the session even if the marker could not be cleared.
    }
    return { ok: false as const, error: resetFailure };
  }
  try {
    await auth.signOut();
  } catch {
    // The recovery marker is already cleared. Leave for a fresh sign-in either way.
  }
  return updated;
}
