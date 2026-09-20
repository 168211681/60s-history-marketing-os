import { randomUUID } from "node:crypto";

function storageConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim().replace(/^(['"])(.*)\1$/, "$2");
  const bucket = process.env.VIDEO_ARTIFACT_BUCKET ?? "video-artifacts";
  if (!url || !serviceKey || !bucket) throw new Error("VIDEO_ARTIFACT_STORAGE_NOT_CONFIGURED");
  return { url: url.replace(/\/$/, ""), serviceKey, bucket };
}

export async function storeVideoArtifact(bytes: Uint8Array, contentType = "video/mp4", fetcher: typeof fetch = fetch) {
  if (bytes.byteLength === 0 || bytes.byteLength > 256 * 1024 * 1024) throw new Error("VIDEO_ARTIFACT_INVALID_SIZE");
  const config = storageConfig();
  const path = `generated/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.mp4`;
  const upload = await fetcher(`${config.url}/storage/v1/object/${config.bucket}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: Buffer.from(bytes),
    signal: AbortSignal.timeout(30_000),
  });
  if (!upload.ok) {
    const detail = (await upload.text()).slice(0, 500);
    console.error("video artifact upload rejected", { status: upload.status, detail });
    throw new Error("VIDEO_ARTIFACT_UPLOAD_FAILED");
  }

  const signed = await fetcher(`${config.url}/storage/v1/object/sign/${config.bucket}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 3600 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!signed.ok) {
    const detail = (await signed.text()).slice(0, 500);
    console.error("video artifact signing rejected", { status: signed.status, detail });
    throw new Error("VIDEO_ARTIFACT_SIGN_FAILED");
  }
  const payload = (await signed.json()) as { signedURL?: unknown; signedUrl?: unknown };
  const signedPath = typeof payload.signedURL === "string" ? payload.signedURL : typeof payload.signedUrl === "string" ? payload.signedUrl : null;
  if (!signedPath) throw new Error("VIDEO_ARTIFACT_INVALID_SIGNED_URL");
  return { path, artifactUrl: signedPath.startsWith("http") ? signedPath : `${config.url}/storage/v1${signedPath}` };
}

/**
 * Provider results are external URLs. Copy them into the private bucket before
 * any downstream upload so the provider URL is never persisted as a workflow
 * artifact or exposed to the browser.
 */
export async function storeVideoArtifactFromUrl(artifactUrl: string, fetcher: typeof fetch = fetch) {
  if (!/^https:\/\//.test(artifactUrl) || artifactUrl.length > 2000) {
    throw new Error("VIDEO_ARTIFACT_INVALID_URL");
  }
  const response = await fetcher(artifactUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("VIDEO_ARTIFACT_FETCH_FAILED");
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > 256 * 1024 * 1024) throw new Error("VIDEO_ARTIFACT_INVALID_SIZE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type")?.split(";", 1)[0] || "video/mp4";
  return storeVideoArtifact(bytes, contentType, fetcher);
}
