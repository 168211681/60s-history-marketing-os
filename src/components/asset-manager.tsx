"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { partBytes, type AssetKind } from "@/lib/clipforge/assets";
import type { AssetRecord } from "@/lib/clipforge/data";
import { DirectUploadError, partProgress, sequentialSigner, uploadMasterObject, uploadThumbnailObject } from "@/lib/clipforge/upload-retry";

function declaredMime(file: File, kind: AssetKind) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (kind === "master_video" && name.endsWith(".mp4")) return "video/mp4";
  if (kind === "master_video" && (name.endsWith(".mov") || name.endsWith(".qt"))) return "video/quicktime";
  if (kind === "thumbnail" && (name.endsWith(".jpg") || name.endsWith(".jpeg"))) return "image/jpeg";
  if (kind === "thumbnail" && name.endsWith(".png")) return "image/png";
  if (kind === "thumbnail" && name.endsWith(".webp")) return "image/webp";
  return "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function putBytes(url: string, body: Blob, contentType: string | undefined, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader("ETag") ?? "");
        return;
      }
      if (xhr.status === 0) {
        reject(new DirectUploadError("The file could not reach private storage.", null));
        return;
      }
      reject(new DirectUploadError(`Upload failed (${xhr.status}).`, xhr.status));
    };
    xhr.onerror = () => reject(new DirectUploadError("The file could not reach private storage.", null));
    xhr.send(body);
  });
}

export function AssetManager({
  contentItemId,
  assets,
  signedUrls,
}: {
  contentItemId: string;
  assets: AssetRecord[];
  signedUrls: Record<string, string>;
}) {
  return (
    <div className="platform-grid">
      <AssetSlot contentItemId={contentItemId} kind="master_video" asset={assets.find((asset) => asset.kind === "master_video")} signedUrl={signedUrlFor(assets, signedUrls, "master_video")} />
      <AssetSlot contentItemId={contentItemId} kind="thumbnail" asset={assets.find((asset) => asset.kind === "thumbnail")} signedUrl={signedUrlFor(assets, signedUrls, "thumbnail")} />
    </div>
  );
}

function signedUrlFor(assets: AssetRecord[], signedUrls: Record<string, string>, kind: AssetKind) {
  const asset = assets.find((item) => item.kind === kind);
  return asset ? signedUrls[asset.storagePath] : undefined;
}

function AssetSlot({
  contentItemId,
  kind,
  asset,
  signedUrl,
}: {
  contentItemId: string;
  kind: AssetKind;
  asset?: AssetRecord;
  signedUrl?: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = kind === "master_video" ? "Master video" : "Thumbnail";
  const accept = kind === "master_video" ? "video/mp4,video/quicktime,.mp4,.mov" : "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function readJson(response: Response) {
    return response.json().catch(() => null);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setProgress(0);
    const mimeType = declaredMime(file, kind);
    const prepared = await fetch(`/api/content-items/${contentItemId}/assets/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, filename: file.name, mimeType, sizeBytes: file.size }),
    });
    const plan = await readJson(prepared);
    if (!prepared.ok) {
      setBusy(false);
      setProgress(null);
      setMessage(plan?.error || "Upload could not start.");
      return;
    }
    try {
      if (kind === "master_video") await uploadMultipart(file, mimeType, plan);
      else await uploadThumbnail(file, mimeType, plan);
      setFile(null);
      setMessage(`${title} saved.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed before a record was saved.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function uploadThumbnail(selected: File, mimeType: string, plan: { path?: string; url?: string; contentType?: string }) {
    if (!plan.url || !plan.path) throw new Error("Upload could not start.");
    const sign = sequentialSigner(plan.url, async () => {
      const again = await fetch(`/api/content-items/${contentItemId}/assets/upload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, filename: selected.name, mimeType, sizeBytes: selected.size, storagePath: plan.path }),
      });
      const payload = await readJson(again);
      if (!again.ok || typeof payload?.url !== "string") {
        throw new DirectUploadError(payload?.error || "Upload could not continue.", again.status);
      }
      return payload.url;
    });
    await uploadThumbnailObject({
      sign,
      put: async (url) => {
        await putBytes(url, selected, plan.contentType || mimeType, (loaded) => {
          setProgress(partProgress(0, loaded, selected.size));
        });
      },
    });
    await saveMetadata(plan.path, selected, mimeType);
  }

  async function uploadMultipart(selected: File, mimeType: string, plan: { path?: string; uploadId?: string; partSize?: number; partCount?: number }) {
    if (!plan.path || !plan.uploadId || !plan.partCount) throw new Error("Upload could not start.");
    const chunk = plan.partSize || partBytes;
    await uploadMasterObject({
      partCount: plan.partCount,
      signPart: async (partNumber) => {
        const signed = await fetch(`/api/content-items/${contentItemId}/assets/upload/part`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storagePath: plan.path, uploadId: plan.uploadId, partNumber, sizeBytes: selected.size }),
        });
        const payload = await readJson(signed);
        if (!signed.ok || typeof payload?.url !== "string") {
          throw new DirectUploadError(payload?.error || "Upload could not continue.", signed.status);
        }
        return payload.url;
      },
      putPart: async (url, partNumber) => {
        const start = (partNumber - 1) * chunk;
        const blob = selected.slice(start, Math.min(start + chunk, selected.size));
        const etag = await putBytes(url, blob, undefined, (loaded) => {
          setProgress(partProgress(start, loaded, selected.size));
        });
        if (!etag) throw new DirectUploadError("Private storage did not return a part id. The upload was stopped.", null, false);
        return etag;
      },
      complete: async (parts) => {
        const completed = await fetch(`/api/content-items/${contentItemId}/assets/upload/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storagePath: plan.path,
            uploadId: plan.uploadId,
            parts,
            mimeType,
            sizeBytes: selected.size,
          }),
        });
        const payload = await readJson(completed);
        if (!completed.ok) throw new DirectUploadError(payload?.error || "Private storage could not finish the upload.", completed.status);
      },
      abort: async () => {
        await fetch(`/api/content-items/${contentItemId}/assets/upload/abort`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storagePath: plan.path, uploadId: plan.uploadId }),
        }).catch(() => undefined);
      },
    });
    await saveMetadata(plan.path, selected, mimeType);
  }

  async function saveMetadata(storagePath: string, selected: File, mimeType: string) {
    const saved = await fetch(`/api/content-items/${contentItemId}/assets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        storagePath,
        originalFilename: selected.name,
        mimeType,
        sizeBytes: selected.size,
      }),
    });
    const payload = await readJson(saved);
    if (!saved.ok) throw new Error(payload?.error || "The upload finished but the record was not saved.");
  }

  async function remove() {
    if (!asset) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/content-items/${contentItemId}/assets/${asset.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "Could not delete that file.");
      return;
    }
    router.refresh();
  }

  async function refreshLink() {
    if (!asset) return;
    const response = await fetch(`/api/content-items/${contentItemId}/assets/${asset.id}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.url) {
      setMessage(payload?.error || "A private link could not be created.");
      return;
    }
    window.open(payload.url, "_blank", "noopener");
  }

  return (
    <section className="platform-card">
      <h3>{title}</h3>
      {asset ? (
        <>
          <p>{asset.originalFilename}</p>
          <p className="muted">{asset.mimeType} · {formatBytes(asset.sizeBytes)}</p>
          {kind === "thumbnail" && signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signedUrl} alt="" className="thumb-preview" />
          ) : null}
          {kind === "master_video" && signedUrl ? <video className="video-preview" controls src={signedUrl} /> : null}
          <div className="copy-row">
            <button className="button" type="button" onClick={() => void refreshLink()}>Open / Download</button>
            <button className="button secondary" type="button" disabled={busy} onClick={() => void remove()}>Delete</button>
          </div>
        </>
      ) : (
        <>
          <label className="file-picker">Select {title.toLowerCase()}
            <input
              type="file"
              accept={accept}
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                setPreview((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return next && kind === "thumbnail" ? URL.createObjectURL(next) : null;
                });
              }}
            />
          </label>
          {file ? <p className="muted">{file.name} · {formatBytes(file.size)}</p> : <p className="muted">No file selected.</p>}
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="thumb-preview" />
          ) : null}
          {progress !== null ? <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div> : null}
          <button className="button" type="button" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload"}</button>
        </>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
