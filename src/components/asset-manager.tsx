"use client";

import { Upload } from "tus-js-client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserAuth } from "@/lib/auth/browser";
import { uploadChunkBytes, type AssetKind } from "@/lib/clipforge/assets";
import type { AssetRecord } from "@/lib/clipforge/data";

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
    const plan = await prepared.json().catch(() => null);
    if (!prepared.ok) {
      setBusy(false);
      setProgress(null);
      setMessage(plan?.error || "Upload could not start.");
      return;
    }
    let token = "";
    try {
      const session = await browserAuth().auth.getSession();
      token = session.data.session?.access_token ?? "";
    } catch {
      token = "";
    }
    if (!token) {
      setBusy(false);
      setProgress(null);
      setMessage("Sign in again before uploading. The file was not sent.");
      return;
    }
    const upload = new Upload(file, {
      endpoint: plan.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: plan.chunkSize || uploadChunkBytes,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: { authorization: `Bearer ${token}` },
      metadata: {
        bucketName: plan.bucket,
        objectName: plan.path,
        contentType: mimeType,
        cacheControl: "3600",
      },
      onError(error) {
        setBusy(false);
        setProgress(null);
        setMessage(error.message || "Upload failed before a record was saved.");
      },
      onProgress(uploaded, total) {
        setProgress(total ? Math.round((uploaded / total) * 100) : 0);
      },
      async onSuccess() {
        const saved = await fetch(`/api/content-items/${contentItemId}/assets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind,
            storagePath: plan.path,
            originalFilename: file.name,
            mimeType,
            sizeBytes: file.size,
          }),
        });
        const payload = await saved.json().catch(() => null);
        setBusy(false);
        setProgress(null);
        if (!saved.ok) {
          setMessage(payload?.error || "The upload finished but the record was not saved.");
          return;
        }
        setFile(null);
        setMessage(`${title} saved.`);
        router.refresh();
      },
    });
    const previous = await upload.findPreviousUploads();
    if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
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
