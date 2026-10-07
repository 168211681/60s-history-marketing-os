export const assetBucket = "clipforge-assets";
export const storageProvider = "r2";
export const maxAssetBytes = 512 * 1024 * 1024;
export const partBytes = 8 * 1024 * 1024;
export const assetKinds = ["master_video", "thumbnail"] as const;
export const videoMimeTypes = ["video/mp4", "video/quicktime"] as const;
export const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export type AssetKind = (typeof assetKinds)[number];
export type UploadPart = { partNumber: number; etag: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const filePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const uploadIdPattern = /^[A-Za-z0-9+/_=-]{8,2048}$/;
const etagPattern = /^(?:W\/)?"[A-Fa-f0-9]{16,64}(?:-\d{1,5})?"$|^[A-Fa-f0-9]{16,64}(?:-\d{1,5})?$/;

export function isAssetKind(value: string): value is AssetKind {
  return assetKinds.includes(value as AssetKind);
}

export function mimeAllowed(kind: AssetKind, mimeType: string) {
  const allowed = kind === "master_video" ? videoMimeTypes : imageMimeTypes;
  return (allowed as readonly string[]).includes(mimeType);
}

export function uploadAllowed(kind: string, mimeType: string, sizeBytes: number): kind is AssetKind {
  return isAssetKind(kind)
    && mimeAllowed(kind, mimeType)
    && Number.isInteger(sizeBytes)
    && sizeBytes >= 1
    && sizeBytes <= maxAssetBytes;
}

export function multipartPlan(sizeBytes: number) {
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxAssetBytes) return null;
  return { partSize: partBytes, partCount: Math.ceil(sizeBytes / partBytes) };
}

export function isAllowedPart(partNumber: number, sizeBytes: number) {
  const plan = multipartPlan(sizeBytes);
  return Boolean(plan) && Number.isInteger(partNumber) && partNumber >= 1 && partNumber <= (plan?.partCount ?? 0);
}

export function isUploadId(value: unknown): value is string {
  return typeof value === "string" && uploadIdPattern.test(value);
}

export function normalizePartEtag(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!etagPattern.test(trimmed)) return null;
  if (trimmed.startsWith("W/") || trimmed.startsWith('"')) return trimmed;
  return `"${trimmed}"`;
}

export function validMultipartParts(parts: unknown, sizeBytes: number) {
  const plan = multipartPlan(sizeBytes);
  if (!plan || !Array.isArray(parts) || parts.length !== plan.partCount) return null;
  const normalized: UploadPart[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part || typeof part !== "object") return null;
    const record = part as { partNumber?: unknown; etag?: unknown };
    if (record.partNumber !== index + 1) return null;
    const etag = normalizePartEtag(record.etag);
    if (!etag) return null;
    normalized.push({ partNumber: index + 1, etag });
  }
  return normalized;
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
