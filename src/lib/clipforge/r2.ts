import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assetBucket, type UploadPart } from "./assets";

const accountPattern = /^[a-f0-9]{32}$/i;

function r2Settings() {
  const accountId = process.env.R2_ACCOUNT_ID ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket = process.env.R2_BUCKET_NAME ?? "";
  if (!accountPattern.test(accountId)) return null;
  if (!accessKeyId || /\s/.test(accessKeyId) || accessKeyId.length > 128) return null;
  if (!secretAccessKey || /[\r\n]/.test(secretAccessKey) || secretAccessKey.length > 256) return null;
  if (bucket !== assetBucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function r2Configured() {
  return r2Settings() !== null;
}

function clientFor(bucketKey: string) {
  const settings = r2Settings();
  if (!settings || !safeObjectKey(bucketKey)) return null;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, bucket: settings.bucket };
}

function safeObjectKey(key: string) {
  if (!key || key.length > 512 || key.includes("..") || key.includes("\\") || key.startsWith("/")) return false;
  const parts = key.split("/");
  return parts.length === 4 && parts.every((part) => part.length > 0 && !part.includes("%"));
}

function missingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const status = "$metadata" in error ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode) : 0;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

export async function headObjectSize(key: string): Promise<number | null | "error"> {
  const ctx = clientFor(key);
  if (!ctx) return "error";
  try {
    const head = await ctx.client.send(new HeadObjectCommand({ Bucket: ctx.bucket, Key: key }));
    return typeof head.ContentLength === "number" ? head.ContentLength : "error";
  } catch (error) {
    return missingObject(error) ? null : "error";
  }
}

export async function removeStoredObject(key: string) {
  const ctx = clientFor(key);
  if (!ctx) return false;
  try {
    await ctx.client.send(new DeleteObjectCommand({ Bucket: ctx.bucket, Key: key }));
    return true;
  } catch (error) {
    return missingObject(error);
  }
}

export async function signStoredObjects(paths: readonly string[], expiresIn = 300) {
  const urls = new Map<string, string>();
  for (const path of paths) {
    const ctx = clientFor(path);
    if (!ctx) continue;
    try {
      const url = await getSignedUrl(ctx.client, new GetObjectCommand({ Bucket: ctx.bucket, Key: path }), { expiresIn });
      urls.set(path, url);
    } catch {
      continue;
    }
  }
  return urls;
}

export async function startMultipartUpload(key: string, contentType: string) {
  const ctx = clientFor(key);
  if (!ctx) return null;
  const created = await ctx.client.send(new CreateMultipartUploadCommand({
    Bucket: ctx.bucket,
    Key: key,
    ContentType: contentType,
  }));
  return created.UploadId ?? null;
}

export async function signUploadPart(key: string, uploadId: string, partNumber: number) {
  const ctx = clientFor(key);
  if (!ctx) return null;
  return getSignedUrl(ctx.client, new UploadPartCommand({
    Bucket: ctx.bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  }), { expiresIn: 300 });
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: readonly UploadPart[]) {
  const ctx = clientFor(key);
  if (!ctx) return false;
  await ctx.client.send(new CompleteMultipartUploadCommand({
    Bucket: ctx.bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })),
    },
  }));
  return true;
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  const ctx = clientFor(key);
  if (!ctx) return false;
  try {
    await ctx.client.send(new AbortMultipartUploadCommand({ Bucket: ctx.bucket, Key: key, UploadId: uploadId }));
    return true;
  } catch (error) {
    return missingObject(error);
  }
}

export async function signPutObject(key: string, contentType: string, sizeBytes: number) {
  const ctx = clientFor(key);
  if (!ctx) return null;
  return getSignedUrl(ctx.client, new PutObjectCommand({
    Bucket: ctx.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  }), { expiresIn: 300 });
}
