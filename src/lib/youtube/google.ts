import { createHash, randomBytes } from "node:crypto";
import { appOrigin } from "@/lib/auth/config";

export const youtubeScopes = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
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

export async function uploadVideoPrivate(
  accessToken: string,
  artifactUrl: string,
  metadata: { title: string; description: string },
  fetcher: typeof fetch = fetch,
) {
  if (!/^https:\/\//.test(artifactUrl) || artifactUrl.length > 2000) throw new Error("YOUTUBE_INVALID_ARTIFACT_URL");
  const source = await fetcher(artifactUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!source.ok) throw new Error("YOUTUBE_ARTIFACT_FETCH_FAILED");
  const declaredLength = Number(source.headers.get("content-length") ?? "0");
  if (declaredLength > 256 * 1024 * 1024) throw new Error("YOUTUBE_ARTIFACT_TOO_LARGE");
  const bytes = new Uint8Array(await source.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 256 * 1024 * 1024) throw new Error("YOUTUBE_ARTIFACT_TOO_LARGE");

  const init = await fetcher("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(bytes.byteLength),
    },
    body: JSON.stringify({
      snippet: { title: metadata.title.trim().slice(0, 100), description: metadata.description.trim().slice(0, 5000), categoryId: "22" },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!init.ok) throw new Error("YOUTUBE_UPLOAD_INIT_FAILED");
  const location = init.headers.get("location");
  if (!location || !/^https:\/\//.test(location)) throw new Error("YOUTUBE_UPLOAD_SESSION_INVALID");
  const uploaded = await fetcher(location, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "video/mp4", "Content-Length": String(bytes.byteLength) },
    body: bytes,
    signal: AbortSignal.timeout(120000),
  });
  if (!uploaded.ok) throw new Error("YOUTUBE_UPLOAD_FAILED");
  const payload = (await uploaded.json()) as { id?: unknown };
  if (typeof payload.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(payload.id)) throw new Error("YOUTUBE_UPLOAD_RESPONSE_INVALID");
  return { youtubeVideoId: payload.id };
}
