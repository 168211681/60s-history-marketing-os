import { createHash, randomBytes } from "node:crypto";
import { appOrigin } from "@/lib/auth/config";

export const youtubeScopes = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const origin = appOrigin();
  if (!clientId || !clientSecret || !origin) return null;
  return { clientId, clientSecret, redirectUri: `${origin}/api/youtube/callback` };
}

export function newOAuthState() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  return { state, verifier };
}

export function authorizationUrl(config: NonNullable<ReturnType<typeof googleConfig>>, state: string, verifier: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", youtubeScopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

type GoogleTokenResponse = { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown };

async function tokenRequest(body: URLSearchParams, fetcher: typeof fetch) {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Google token request failed");
  const data: GoogleTokenResponse = await response.json();
  if (typeof data.access_token !== "string" || !data.access_token) throw new Error("Google token response is invalid");
  return data;
}

export async function exchangeCode(config: NonNullable<ReturnType<typeof googleConfig>>, code: string, verifier: string, fetcher: typeof fetch = fetch) {
  if (!code || code.length > 2048 || !verifier) throw new Error("Invalid OAuth callback");
  const body = new URLSearchParams({
    code, client_id: config.clientId, client_secret: config.clientSecret,
    redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: verifier,
  });
  const data = await tokenRequest(body, fetcher);
  if (typeof data.refresh_token !== "string" || !data.refresh_token) throw new Error("Google did not return offline access");
  const grantedScopes = data.scope;
  if (typeof grantedScopes === "string" && !youtubeScopes.every((scope) => grantedScopes.split(" ").includes(scope))) throw new Error("Required YouTube scope was not granted");
  return { accessToken: data.access_token as string, refreshToken: data.refresh_token, scopes: youtubeScopes.join(" ") };
}

export async function refreshAccessToken(config: NonNullable<ReturnType<typeof googleConfig>>, refreshToken: string, fetcher: typeof fetch = fetch) {
  const body = new URLSearchParams({
    client_id: config.clientId, client_secret: config.clientSecret,
    refresh_token: refreshToken, grant_type: "refresh_token",
  });
  const data = await tokenRequest(body, fetcher);
  return data.access_token as string;
}

export async function revokeToken(token: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    body: new URLSearchParams({ token }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  return response.ok;
}

export async function ownerChannel(accessToken: string, fetcher: typeof fetch = fetch) {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("YouTube channel lookup failed");
  const data: unknown = await response.json();
  const items = data && typeof data === "object" && "items" in data ? (data as { items: unknown }).items : null;
  if (!Array.isArray(items) || items.length !== 1) throw new Error("Expected exactly one authorized YouTube channel");
  const item = items[0];
  const id = item?.id;
  const title = item?.snippet?.title;
  if (typeof id !== "string" || !/^UC[A-Za-z0-9_-]{22}$/.test(id) || typeof title !== "string" || !title.trim() || title.length > 200) {
    throw new Error("YouTube channel response is invalid");
  }
  return { id, title: title.trim() };
}
