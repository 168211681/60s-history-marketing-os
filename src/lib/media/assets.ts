import { randomUUID } from "node:crypto";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.IMAGE_ASSET_BUCKET ?? "image-assets";
  if (!url || !key) throw new Error("IMAGE_ASSET_STORAGE_NOT_CONFIGURED");
  return { url, key, bucket };
}

function extension(type: string) {
  return type === "image/jpeg" ? "jpg" : type.split("/")[1];
}

async function signedUrl(path: string, fetcher: typeof fetch, settings: ReturnType<typeof config>) {
  const response = await fetcher(`${settings.url}/storage/v1/object/sign/${settings.bucket}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.key}`, apikey: settings.key, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 86400 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("IMAGE_ASSET_SIGN_FAILED");
  const payload = (await response.json()) as { signedURL?: unknown; signedUrl?: unknown };
  const value = typeof payload.signedURL === "string" ? payload.signedURL : typeof payload.signedUrl === "string" ? payload.signedUrl : null;
  if (!value) throw new Error("IMAGE_ASSET_INVALID_SIGNED_URL");
  return value.startsWith("http") ? value : `${settings.url}/storage/v1${value}`;
}

export async function uploadImageAsset(ownerId: string, bytes: Uint8Array, contentType: string, fetcher: typeof fetch = fetch) {
  if (!ALLOWED_TYPES.has(contentType)) throw new Error("IMAGE_ASSET_INVALID_TYPE");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("IMAGE_ASSET_INVALID_SIZE");
  const settings = config();
  const path = `${ownerId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension(contentType)}`;
  const response = await fetcher(`${settings.url}/storage/v1/object/${settings.bucket}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.key}`, apikey: settings.key, "Content-Type": contentType, "x-upsert": "false" },
    body: Buffer.from(bytes),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("IMAGE_ASSET_UPLOAD_FAILED");
  return { path, url: await signedUrl(path, fetcher, settings) };
}

export async function listImageAssets(ownerId: string, fetcher: typeof fetch = fetch) {
  const settings = config();
  const response = await fetcher(`${settings.url}/storage/v1/object/list/${settings.bucket}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.key}`, apikey: settings.key, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: `${ownerId}/`, limit: 50, offset: 0, sortBy: { column: "created_at", order: "desc" } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("IMAGE_ASSET_LIST_FAILED");
  const entries = (await response.json()) as Array<{ name?: unknown; id?: unknown; created_at?: unknown; metadata?: { mimetype?: unknown; size?: unknown } }>;
  const assets = [];
  for (const entry of entries) {
    if (typeof entry.name !== "string" || !entry.name || entry.name.includes("..")) continue;
    assets.push({ path: entry.name, createdAt: typeof entry.created_at === "string" ? entry.created_at : null, contentType: typeof entry.metadata?.mimetype === "string" ? entry.metadata.mimetype : null, size: typeof entry.metadata?.size === "number" ? entry.metadata.size : null, url: await signedUrl(entry.name, fetcher, settings) });
  }
  return assets;
}
