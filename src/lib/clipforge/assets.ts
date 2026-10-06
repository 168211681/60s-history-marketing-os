export const assetBucket = "clipforge-assets";
export const maxAssetBytes = 512 * 1024 * 1024;
export const assetKinds = ["master_video", "thumbnail"] as const;
export const videoMimeTypes = ["video/mp4", "video/quicktime"] as const;
export const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const uploadChunkBytes = 6 * 1024 * 1024;

export type AssetKind = (typeof assetKinds)[number];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const filePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

export function isAssetKind(value: string): value is AssetKind {
  return assetKinds.includes(value as AssetKind);
}

export function mimeAllowed(kind: AssetKind, mimeType: string) {
  const allowed = kind === "master_video" ? videoMimeTypes : imageMimeTypes;
  return (allowed as readonly string[]).includes(mimeType);
}

export function sanitizeAssetFilename(filename: string) {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);
  return cleaned || "file";
}

export function isScopedAssetPath(path: string, ownerId: string, contentItemId: string, kind: AssetKind) {
  if (path.includes("..") || path.includes("\\") || path.includes("%")) return false;
  const parts = path.split("/");
  if (parts.length !== 4) return false;
  const [owner, content, folder, filename] = parts;
  return owner === ownerId.toLowerCase()
    && content === contentItemId.toLowerCase()
    && folder === kind
    && uuidPattern.test(owner)
    && uuidPattern.test(content)
    && filePattern.test(filename);
}

export function buildAssetPath(ownerId: string, contentItemId: string, kind: AssetKind, filename: string, uniqueId = crypto.randomUUID()) {
  const owner = ownerId.toLowerCase();
  const content = contentItemId.toLowerCase();
  if (!uuidPattern.test(owner) || !uuidPattern.test(content) || !uuidPattern.test(uniqueId) || !isAssetKind(kind)) return null;
  const path = `${owner}/${content}/${kind}/${uniqueId}-${sanitizeAssetFilename(filename)}`;
  return isScopedAssetPath(path, owner, content, kind) ? path : null;
}

export function resumableUploadEndpoint(supabaseUrl: string) {
  let hostname = "";
  try {
    hostname = new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
  const ref = hostname.split(".")[0] ?? "";
  if (!/^[a-z]{20}$/.test(ref) || !hostname.endsWith(".supabase.co")) return null;
  return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;
}
