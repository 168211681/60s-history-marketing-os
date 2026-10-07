import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { GET as confirmRecovery } from "../src/app/auth/confirm/route";
import { GET } from "../src/app/auth/callback/route";
import {
  applyRecoveryMarker,
  clearRecoveryMarker,
  hasRecoveryMarker,
  recoveryCookieMaxAge,
  recoveryCookieName,
  recoveryCookieSecure,
  recoveryMarkerDecision,
  resetPasswordAccess,
  writeRecoveryDecision,
} from "../src/lib/auth/recovery-cookie";
import {
  callbackDestination,
  changeOwnerPassword,
  completeOwnerPasswordReset,
  confirmRecoveryGrant,
  passwordSignInMessage,
  recoveryRedirect,
  recoveryRequestMessage,
  safeAuthNext,
  signInFailureMessage,
  validateNewPassword,
} from "../src/lib/auth/recovery";

const owner = "10000000-0000-4000-8000-000000000001";
const previous = {
  APP_ORIGIN: process.env.APP_ORIGIN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  OWNER_USER_ID: process.env.OWNER_USER_ID,
};

after(() => {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function locationPath(response: Response) {
  const location = response.headers.get("location");
  assert.ok(location);
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

test("OAuth callback never authorizes password reset", () => {
  assert.equal(safeAuthNext("/reset-password"), "/settings");
  assert.equal(safeAuthNext("/settings"), "/settings");
  assert.equal(
    callbackDestination({ code: "pkce-code", next: "/reset-password", exchanged: true, ownerMatches: true }),
    "/settings",
  );
  assert.equal(
    callbackDestination({ code: "pkce-code", next: null, exchanged: true, ownerMatches: true }),
    "/settings",
  );
});

test("callback rejects external next URLs", () => {
  for (const next of ["https://evil.example/phish", "http://evil.example", "/reset-password/extra", "/settings?next=https://evil.example", "https://app.example/reset-password"]) {
    assert.equal(safeAuthNext(next), "/settings");
    assert.equal(callbackDestination({ code: "pkce-code", next, exchanged: true, ownerMatches: true }), "/settings");
    assert.doesNotMatch(callbackDestination({ code: "pkce-code", next, exchanged: true, ownerMatches: true }), /evil|https?:/);
  }
});

test("callback rejects //evil.example", () => {
  assert.equal(safeAuthNext("//evil.example"), "/settings");
  assert.equal(safeAuthNext("//evil.example/reset-password"), "/settings");
  assert.equal(
    callbackDestination({ code: "pkce-code", next: "//evil.example", exchanged: true, ownerMatches: true }),
    "/settings",
  );
});

test("missing callback code fails safely", async () => {
  assert.equal(
    callbackDestination({ code: null, next: "/reset-password", exchanged: false, ownerMatches: false }),
    "/settings?auth_error=callback",
  );
  assert.equal(
    callbackDestination({ code: "", next: "/reset-password", exchanged: true, ownerMatches: true }),
    "/settings?auth_error=callback",
  );
  assert.equal(
    callbackDestination({ code: "bad\ncode", next: "/reset-password", exchanged: true, ownerMatches: true }),
    "/settings?auth_error=callback",
  );

  process.env.APP_ORIGIN = "http://localhost:3000";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const missing = await GET(new NextRequest("http://localhost:3000/auth/callback?next=/reset-password"));
  assert.equal(missing.status, 307);
  assert.equal(locationPath(missing), "/settings?auth_error=callback");
  assert.equal(missing.headers.get("cache-control"), "private, no-store");
  assert.match(missing.headers.get("set-cookie") ?? "", /clipforge_recovery=;/);
  assert.doesNotMatch(missing.headers.get("set-cookie") ?? "", /clipforge_recovery=1/);

  const beforeExchange = await GET(new NextRequest("http://localhost:3000/auth/callback?code=present&next=https://evil.example"));
  assert.equal(beforeExchange.status, 307);
  assert.equal(locationPath(beforeExchange), "/settings?auth_error=callback");
  assert.doesNotMatch(beforeExchange.headers.get("location") ?? "", /evil/);
  assert.doesNotMatch(beforeExchange.headers.get("set-cookie") ?? "", /clipforge_recovery=1/);

  const oauthReset = await GET(new NextRequest("http://localhost:3000/auth/callback?code=present&next=/reset-password"));
  assert.equal(locationPath(oauthReset), "/settings?auth_error=callback");
  assert.doesNotMatch(oauthReset.headers.get("location") ?? "", /reset-password/);
  assert.doesNotMatch(oauthReset.headers.get("set-cookie") ?? "", /clipforge_recovery=1/);

  const mismatched = await GET(new NextRequest("http://evil.example/auth/callback?code=untrusted&next=//evil.example"));
  assert.equal(mismatched.status, 503);
  assert.equal(mismatched.headers.get("cache-control"), "private, no-store");
  assert.equal(await mismatched.text(), "Authentication origin is not configured");

  delete process.env.APP_ORIGIN;
  const unconfigured = await GET(new NextRequest("http://localhost:3000/auth/callback?code=untrusted"));
  assert.equal(unconfigured.status, 503);
});

test("password mismatch and short passwords are rejected before any update", async () => {
  assert.equal(validateNewPassword("short-pass", "short-pass"), "Use at least 12 characters.");
  assert.equal(validateNewPassword("long-enough-password", "different-password"), "Passwords do not match.");
  assert.equal(validateNewPassword("long-enough-password", "long-enough-password"), null);

  let calls = 0;
  const auth = {
    getUser: async () => {
      calls += 1;
      return { data: { user: { id: owner } } };
    },
    updateUser: async () => {
      calls += 1;
      return { error: null };
    },
  };
  const mismatch = await changeOwnerPassword(auth, {
    password: "long-enough-password",
    confirm: "different-password",
    ownerId: owner,
  });
  const short = await changeOwnerPassword(auth, { password: "too-short", confirm: "too-short", ownerId: owner });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "Passwords do not match.");
  assert.equal(short.ok, false);
  assert.equal(short.error, "Use at least 12 characters.");
  assert.equal(calls, 0);
});

test("successful password update returns the sign-in redirect without ending the session first", async () => {
  let updated = "";
  const result = await changeOwnerPassword(
    {
      getUser: async () => ({ data: { user: { id: owner.toUpperCase() } } }),
      updateUser: async ({ password }) => {
        updated = password;
        return { error: null };
      },
    },
    { password: "a-new-password", confirm: "a-new-password", ownerId: owner },
  );
  assert.deepEqual(result, { ok: true, redirect: "/settings?password_reset=success" });
  assert.equal(updated, "a-new-password");
});

test("successful reset clears the recovery marker before signing out", async () => {
  const order: string[] = [];
  let cleared: { value: string; maxAge: number; httpOnly: boolean; sameSite: string; path: string; secure: boolean } | null = null;
  const result = await completeOwnerPasswordReset(
    {
      getUser: async () => ({ data: { user: { id: owner } } }),
      updateUser: async () => {
        order.push("update");
        return { error: null };
      },
      signOut: async () => {
        order.push("signOut");
      },
    },
    { password: "a-new-password", confirm: "a-new-password", ownerId: owner },
    async () => {
      order.push("clear");
      applyRecoveryMarker(
        {
          set: (_name, value, options) => {
            cleared = { value, maxAge: options.maxAge, httpOnly: options.httpOnly, sameSite: options.sameSite, path: options.path, secure: options.secure };
          },
        },
        "/settings",
        true,
      );
    },
  );
  assert.deepEqual(result, { ok: true, redirect: "/settings?password_reset=success" });
  assert.deepEqual(order, ["update", "clear", "signOut"]);
  assert.deepEqual(cleared, { value: "", maxAge: 0, httpOnly: true, sameSite: "lax", path: "/reset-password", secure: true });

  const leaked = "marker clear failed token=recovery-secret";
  let signedOut = 0;
  const failedClear = await completeOwnerPasswordReset(
    {
      getUser: async () => ({ data: { user: { id: owner } } }),
      updateUser: async () => ({ error: null }),
      signOut: async () => {
        signedOut += 1;
      },
    },
    { password: "a-new-password", confirm: "a-new-password", ownerId: owner },
    async () => {
      throw new Error(leaked);
    },
  );
  assert.equal(failedClear.ok, false);
  assert.equal(failedClear.error, "The password could not be changed. Request a new reset link and try again.");
  assert.doesNotMatch(failedClear.error ?? "", /token|secret/);
  assert.equal(signedOut, 1);
});

test("failed password update shows a safe message", async () => {
  const leaked = "provider failure token=recovery-secret access_token=abc";
  const result = await changeOwnerPassword(
    {
      getUser: async () => ({ data: { user: { id: owner } } }),
      updateUser: async () => ({ error: { message: leaked } }),
    },
    { password: "a-new-password", confirm: "a-new-password", ownerId: owner },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "The password could not be changed. Request a new reset link and try again.");
  assert.equal(result.error?.includes(leaked), false);
  assert.doesNotMatch(result.error ?? "", /token|provider|secret|access_token/i);

  const stranger = await changeOwnerPassword(
    {
      getUser: async () => ({ data: { user: { id: "20000000-0000-4000-8000-000000000002" } } }),
      updateUser: async () => {
        throw new Error("must not update");
      },
    },
    { password: "a-new-password", confirm: "a-new-password", ownerId: owner },
  );
  assert.equal(stranger.ok, false);
  assert.match(stranger.error ?? "", /reset link/i);
});

test("forgot-password asks Supabase to email a confirm link and does not reveal accounts", () => {
  const redirect = new URL(recoveryRedirect("https://app.example"));
  assert.equal(redirect.origin, "https://app.example");
  assert.equal(redirect.pathname, "/auth/confirm");
  assert.equal(redirect.searchParams.get("next"), "/reset-password");
  assert.equal(redirect.searchParams.get("token_hash"), null);
  assert.equal(recoveryRequestMessage(), "If that account exists, a password reset link has been sent.");

  const buttons = readFileSync(new URL("../src/components/auth-buttons.tsx", import.meta.url), "utf8");
  assert.match(buttons, /resetPasswordForEmail\(trimmed, \{/);
  assert.match(buttons, /redirectTo: recoveryRedirect\(window\.location\.origin\)/);
  assert.match(buttons, /setNotice\(recoveryRequestMessage\(\)\)/);
  assert.doesNotMatch(buttons, /not found|does not exist|no account|user exists|error\.message/i);
  assert.match(buttons, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
  assert.doesNotMatch(buttons, /\/auth\/callback\?next=\/reset-password/);
  assert.doesNotMatch(buttons, /NEXT_PUBLIC_OWNER_USER_ID/);
});

test("password sign-in distinguishes credentials from setup failures", () => {
  assert.equal(passwordSignInMessage({ code: "invalid_credentials", message: "raw database password leaked" }), signInFailureMessage("credentials"));
  assert.equal(passwordSignInMessage({ message: "Invalid login credentials" }), "Email or password is incorrect.");
  const setup = passwordSignInMessage({ code: "unexpected", message: "service_role key leaked in body" });
  assert.equal(setup, "Sign-in could not start. Check the authentication setup.");
  assert.doesNotMatch(setup, /service_role|leaked/);
});

test("proxy matcher includes reset-password and auth responses are not cached", () => {
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /"\/auth\/callback"/);
  assert.match(proxy, /"\/auth\/confirm"/);
  assert.match(proxy, /"\/reset-password"/);
  assert.match(proxy, /"\/settings"/);
  assert.match(proxy, /Cache-Control", "private, no-store"/);
});

test("reset page requires a recovery marker in addition to the owner session", () => {
  assert.equal(resetPasswordAccess({ configured: true, owner: true, recoveryMarker: false }), "needs-link");
  assert.equal(resetPasswordAccess({ configured: true, owner: true, recoveryMarker: true }), "form");
  assert.equal(resetPasswordAccess({ configured: true, owner: false, recoveryMarker: true }), "needs-link");
  assert.equal(resetPasswordAccess({ configured: false, owner: true, recoveryMarker: true }), "unconfigured");
  assert.equal(hasRecoveryMarker("1"), true);
  assert.equal(hasRecoveryMarker(undefined), false);
  assert.equal(hasRecoveryMarker(""), false);
  assert.equal(hasRecoveryMarker("true"), false);

  const page = readFileSync(new URL("../src/app/reset-password/page.tsx", import.meta.url), "utf8");
  assert.match(page, /resetPasswordAccess\(/);
  assert.match(page, /hasRecoveryMarker\(jar\.get\(recoveryCookieName\)\?\.value\)/);
  assert.match(page, /access === "form" && owner \? \(/);
  assert.match(page, /<ResetPasswordForm ownerId=\{owner\.id\} \/>/);
  assert.doesNotMatch(page, /<ResetPasswordForm[^>]*\b(marker|recovery|cookie)=/);
  const formAt = page.indexOf("<ResetPasswordForm");
  const gateAt = page.indexOf('access === "form"');
  assert.ok(gateAt > 0 && formAt > gateAt);
});

test("callback sets the recovery marker only for an owner reset destination", () => {
  assert.equal(recoveryMarkerDecision("/reset-password"), "set");
  assert.equal(recoveryMarkerDecision("/settings"), "clear");
  assert.equal(recoveryMarkerDecision("/settings?auth=denied"), "clear");
  assert.equal(recoveryMarkerDecision("/settings?auth_error=callback"), "clear");
  assert.equal(recoveryCookieSecure("https://app.example"), true);
  assert.equal(recoveryCookieSecure("http://localhost:3000"), false);
  assert.equal(recoveryCookieMaxAge, 600);

  const resetDestination = callbackDestination({ code: "pkce-code", next: "/reset-password", exchanged: true, ownerMatches: true });
  assert.equal(resetDestination, "/settings");
  assert.equal(recoveryMarkerDecision(resetDestination), "clear");

  const settingsDestination = callbackDestination({ code: "pkce-code", next: null, exchanged: true, ownerMatches: true });
  assert.equal(settingsDestination, "/settings");
  assert.equal(recoveryMarkerDecision(settingsDestination), "clear");

  for (const next of ["https://evil.example/phish", "//evil.example", "/reset-password/extra"]) {
    const destination = callbackDestination({ code: "pkce-code", next, exchanged: true, ownerMatches: true });
    assert.equal(destination, "/settings");
    assert.equal(recoveryMarkerDecision(destination), "clear");
  }
  const denied = callbackDestination({ code: "pkce-code", next: "/reset-password", exchanged: true, ownerMatches: false });
  assert.equal(recoveryMarkerDecision(denied), "clear");

  const secureReset = NextResponse.redirect("https://app.example/reset-password");
  applyRecoveryMarker(secureReset.cookies, "/reset-password", true);
  const setHeader = secureReset.headers.get("set-cookie") ?? "";
  assert.match(setHeader, new RegExp(`${recoveryCookieName}=1`));
  assert.match(setHeader, /HttpOnly/i);
  assert.match(setHeader, /SameSite=Lax/i);
  assert.match(setHeader, /Secure/i);
  assert.match(setHeader, /Path=\/reset-password/);
  assert.match(setHeader, /Max-Age=600/);

  const settings = NextResponse.redirect("https://app.example/settings");
  applyRecoveryMarker(settings.cookies, "/settings", true);
  const clearHeader = settings.headers.get("set-cookie") ?? "";
  assert.match(clearHeader, /clipforge_recovery=;/);
  assert.doesNotMatch(clearHeader, /clipforge_recovery=1/);
  assert.match(clearHeader, /HttpOnly/i);
  assert.match(clearHeader, /SameSite=Lax/i);
  assert.match(clearHeader, /Path=\/reset-password/);
  assert.match(clearHeader, /Max-Age=0/);

  const local = NextResponse.redirect("http://localhost:3000/reset-password");
  applyRecoveryMarker(local.cookies, "/reset-password", recoveryCookieSecure("http://localhost:3000"));
  assert.doesNotMatch(local.headers.get("set-cookie") ?? "", /Secure/i);

  const buttons = readFileSync(new URL("../src/components/auth-buttons.tsx", import.meta.url), "utf8");
  assert.match(buttons, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
  assert.doesNotMatch(buttons, /clipforge_recovery|recoveryMarker/);
  const route = readFileSync(new URL("../src/app/auth/callback/route.ts", import.meta.url), "utf8");
  assert.match(route, /clearRecoveryMarker\(response\.cookies, recoveryCookieSecure\(origin\)\)/);
  assert.doesNotMatch(route, /applyRecoveryMarker|writeRecoveryDecision|\/reset-password/);
  assert.match(route, /redirectTo\(origin, callbackDestination\(/);
  const form = readFileSync(new URL("../src/components/reset-password-form.tsx", import.meta.url), "utf8");
  const updateAt = form.indexOf("completeOwnerPasswordReset(");
  const clearAt = form.indexOf("() => clearPasswordRecoveryMarker()");
  const redirectAt = form.indexOf("window.location.assign");
  assert.ok(updateAt > 0 && clearAt > updateAt && redirectAt > clearAt);
  assert.doesNotMatch(form, /clipforge_recovery|document\.cookie/);
});

test("recovery confirmation verifies the recovery token before setting the marker", async () => {
  const token = "recovery-token-hash";
  let verified: { token_hash?: string; type?: string } | null = null;
  let signedOut = 0;
  const success = await confirmRecoveryGrant(
    {
      verifyOtp: async (input) => {
        verified = input;
        return { error: null };
      },
      getUser: async () => ({ data: { user: { id: owner } } }),
      signOut: async () => {
        signedOut += 1;
      },
    },
    { tokenHash: token, type: "recovery", next: "/reset-password", ownerId: owner },
  );
  assert.deepEqual(success, { destination: "/reset-password", marker: "set" });
  assert.deepEqual(verified, { token_hash: token, type: "recovery" });
  assert.equal(signedOut, 0);

  const omittedNext = await confirmRecoveryGrant(
    {
      verifyOtp: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: owner.toUpperCase() } } }),
      signOut: async () => undefined,
    },
    { tokenHash: token, type: "recovery", next: null, ownerId: owner },
  );
  assert.deepEqual(omittedNext, { destination: "/reset-password", marker: "set" });

  const calls = { verify: 0 };
  const auth = {
    verifyOtp: async () => {
      calls.verify += 1;
      return { error: null };
    },
    getUser: async () => ({ data: { user: { id: owner } } }),
    signOut: async () => undefined,
  };
  for (const input of [
    { tokenHash: null, type: "recovery", next: "/reset-password" },
    { tokenHash: "", type: "recovery", next: "/reset-password" },
    { tokenHash: "bad\nhash", type: "recovery", next: "/reset-password" },
    { tokenHash: token, type: "email", next: "/reset-password" },
    { tokenHash: token, type: "invite", next: "/reset-password" },
    { tokenHash: token, type: "recovery", next: "https://evil.example" },
    { tokenHash: token, type: "recovery", next: "//evil.example" },
  ]) {
    const denied = await confirmRecoveryGrant(auth, { ...input, ownerId: owner });
    assert.equal(denied.destination, "/settings?auth_error=recovery");
    assert.equal(denied.marker, "clear");
    assert.doesNotMatch(denied.destination, /evil|token/);
  }
  assert.equal(calls.verify, 0);

  const leaked = "otp failed token_hash=super-secret";
  const invalid = await confirmRecoveryGrant(
    {
      verifyOtp: async () => ({ error: { message: leaked } }),
      getUser: async () => {
        throw new Error("must not read user");
      },
      signOut: async () => undefined,
    },
    { tokenHash: token, type: "recovery", next: "/reset-password", ownerId: owner },
  );
  assert.equal(invalid.destination, "/settings?auth_error=recovery");
  assert.equal(invalid.marker, "clear");
  assert.doesNotMatch(JSON.stringify(invalid), /super-secret|token_hash=/);

  let nonOwnerSignedOut = 0;
  const nonOwner = await confirmRecoveryGrant(
    {
      verifyOtp: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: "20000000-0000-4000-8000-000000000002" } } }),
      signOut: async () => {
        nonOwnerSignedOut += 1;
      },
    },
    { tokenHash: token, type: "recovery", next: "/reset-password", ownerId: owner },
  );
  assert.deepEqual(nonOwner, { destination: "/settings?auth_error=recovery", marker: "clear" });
  assert.equal(nonOwnerSignedOut, 1);

  const secure = NextResponse.redirect("https://app.example/reset-password");
  writeRecoveryDecision(secure.cookies, success.marker, true);
  const setHeader = secure.headers.get("set-cookie") ?? "";
  assert.match(setHeader, /clipforge_recovery=1/);
  assert.match(setHeader, /HttpOnly/i);
  assert.match(setHeader, /SameSite=Lax/i);
  assert.match(setHeader, /Max-Age=600/);
  clearRecoveryMarker(secure.cookies, true);

  process.env.APP_ORIGIN = "http://localhost:3000";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = "logged-token-hash-should-not-appear";
  for (const query of [
    `token_hash=${secret}&type=email&next=/reset-password`,
    `token_hash=${secret}&type=invite&next=https://evil.example`,
    "type=recovery&next=/reset-password",
    `token_hash=${encodeURIComponent("bad\nhash")}&type=recovery`,
  ]) {
    const response = await confirmRecovery(new NextRequest(`http://localhost:3000/auth/confirm?${query}`));
    assert.equal(response.status, 307);
    assert.equal(locationPath(response), "/settings?auth_error=recovery");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(response.headers.get("location") ?? "", /logged-token|evil/);
    assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /clipforge_recovery=1/);
    assert.doesNotMatch(await response.text(), new RegExp(secret));
  }
  const mismatched = await confirmRecovery(new NextRequest("http://evil.example/auth/confirm?token_hash=untrusted&type=recovery"));
  assert.equal(mismatched.status, 503);

  const confirmSource = readFileSync(new URL("../src/app/auth/confirm/route.ts", import.meta.url), "utf8");
  const recoverySource = readFileSync(new URL("../src/lib/auth/recovery.ts", import.meta.url), "utf8");
  assert.match(confirmSource, /confirmRecoveryGrant\(/);
  assert.match(confirmSource, /writeRecoveryDecision\(response\.cookies, marker/);
  assert.match(confirmSource, /finish\(origin, grant\.destination, grant\.marker, response\)/);
  assert.match(recoverySource, /verifyOtp\(\{ token_hash: input\.tokenHash, type: "recovery" \}\)/);
  assert.doesNotMatch(confirmSource, /console\.(log|debug|info|warn|error|trace)/);
  assert.doesNotMatch(recoverySource, /console\.(log|debug|info|warn|error|trace)/);
});

test("auth recovery code does not log tokens, codes, or passwords", () => {
  const files = [
    "../src/lib/auth/recovery.ts",
    "../src/lib/auth/recovery-cookie.ts",
    "../src/lib/auth/browser.ts",
    "../src/lib/auth/server.ts",
    "../src/lib/auth/config.ts",
    "../src/app/auth/callback/route.ts",
    "../src/app/auth/confirm/route.ts",
    "../src/app/reset-password/page.tsx",
    "../src/app/reset-password/actions.ts",
    "../src/components/auth-buttons.tsx",
    "../src/components/reset-password-form.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /console\.(log|debug|info|warn|error|trace)/);
    assert.doesNotMatch(source, /access_token|refresh_token|service_role|NEXT_PUBLIC_OWNER_USER_ID/);
  }
  const route = readFileSync(new URL("../src/app/auth/callback/route.ts", import.meta.url), "utf8");
  const exchangeAt = route.indexOf("exchangeCodeForSession");
  const destinationAt = route.indexOf("callbackDestination(");
  assert.ok(exchangeAt > 0 && destinationAt > exchangeAt);
  const form = readFileSync(new URL("../src/components/reset-password-form.tsx", import.meta.url), "utf8");
  assert.match(form, /completeOwnerPasswordReset\(\s*auth\.auth/);
  assert.doesNotMatch(form, /fetch\(|\/api\//);
});
