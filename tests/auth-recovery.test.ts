import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/auth/callback/route";
import {
  callbackDestination,
  changeOwnerPassword,
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

test("callback accepts safe internal next=/reset-password", () => {
  assert.equal(safeAuthNext("/reset-password"), "/reset-password");
  assert.equal(safeAuthNext("/settings"), "/settings");
  assert.equal(
    callbackDestination({ code: "pkce-code", next: "/reset-password", exchanged: true, ownerMatches: true }),
    "/reset-password",
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

  const beforeExchange = await GET(new NextRequest("http://localhost:3000/auth/callback?code=present&next=https://evil.example"));
  assert.equal(beforeExchange.status, 307);
  assert.equal(locationPath(beforeExchange), "/settings?auth_error=callback");
  assert.doesNotMatch(beforeExchange.headers.get("location") ?? "", /evil/);

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
    signOut: async () => {
      calls += 1;
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

test("successful password update signs out and redirects", async () => {
  let updated = "";
  let signedOut = 0;
  const result = await changeOwnerPassword(
    {
      getUser: async () => ({ data: { user: { id: owner.toUpperCase() } } }),
      updateUser: async ({ password }) => {
        updated = password;
        return { error: null };
      },
      signOut: async () => {
        signedOut += 1;
      },
    },
    { password: "a-new-password", confirm: "a-new-password", ownerId: owner },
  );
  assert.deepEqual(result, { ok: true, redirect: "/settings?password_reset=success" });
  assert.equal(updated, "a-new-password");
  assert.equal(signedOut, 1);
});

test("failed password update shows a safe message", async () => {
  const leaked = "provider failure token=recovery-secret access_token=abc";
  let signedOut = 0;
  const result = await changeOwnerPassword(
    {
      getUser: async () => ({ data: { user: { id: owner } } }),
      updateUser: async () => ({ error: { message: leaked } }),
      signOut: async () => {
        signedOut += 1;
      },
    },
    { password: "a-new-password", confirm: "a-new-password", ownerId: owner },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "The password could not be changed. Request a new reset link and try again.");
  assert.equal(result.error?.includes(leaked), false);
  assert.doesNotMatch(result.error ?? "", /token|provider|secret|access_token/i);
  assert.equal(signedOut, 0);

  const stranger = await changeOwnerPassword(
    {
      getUser: async () => ({ data: { user: { id: "20000000-0000-4000-8000-000000000002" } } }),
      updateUser: async () => {
        throw new Error("must not update");
      },
      signOut: async () => undefined,
    },
    { password: "a-new-password", confirm: "a-new-password", ownerId: owner },
  );
  assert.equal(stranger.ok, false);
  assert.match(stranger.error ?? "", /reset link/i);
});

test("forgot-password uses /auth/callback?next=/reset-password and does not reveal accounts", () => {
  const redirect = new URL(recoveryRedirect("https://app.example"));
  assert.equal(redirect.origin, "https://app.example");
  assert.equal(redirect.pathname, "/auth/callback");
  assert.equal(redirect.searchParams.get("next"), "/reset-password");
  assert.equal(recoveryRequestMessage(), "If that account exists, a password reset link has been sent.");

  const buttons = readFileSync(new URL("../src/components/auth-buttons.tsx", import.meta.url), "utf8");
  assert.match(buttons, /redirectTo: recoveryRedirect\(window\.location\.origin\)/);
  assert.match(buttons, /setNotice\(recoveryRequestMessage\(\)\)/);
  assert.doesNotMatch(buttons, /not found|does not exist|no account|user exists|error\.message/i);
  assert.match(buttons, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
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
  assert.match(proxy, /"\/reset-password"/);
  assert.match(proxy, /"\/settings"/);
  assert.match(proxy, /Cache-Control", "private, no-store"/);
});

test("auth recovery code does not log tokens, codes, or passwords", () => {
  const files = [
    "../src/lib/auth/recovery.ts",
    "../src/lib/auth/browser.ts",
    "../src/lib/auth/server.ts",
    "../src/lib/auth/config.ts",
    "../src/app/auth/callback/route.ts",
    "../src/app/reset-password/page.tsx",
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
  assert.match(form, /changeOwnerPassword\(auth\.auth/);
  assert.doesNotMatch(form, /fetch\(|\/api\//);
});
