"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Asset = { path: string; url: string; contentType: string | null; size: number | null; createdAt: string | null };
type AssetLoad = { assets: Asset[]; authenticated?: boolean };

export function ImageAssetUploader() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load(): Promise<AssetLoad> {
    const response = await fetch("/api/media/images", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Could not load image assets");
    return (await response.json()) as AssetLoad;
  }

  useEffect(() => {
    void load()
      .then((payload) => { setAssets(payload.assets); if (payload.authenticated === false) setMessage("Sign in to manage private image assets."); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load image assets"));
  }, []);

  async function upload(files: File[]) {
    setBusy(true); setMessage(null);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const body = new FormData(); body.set("file", files[index]);
        const response = await fetch("/api/media/images", { method: "POST", body, credentials: "same-origin" });
        if (response.status === 401) throw new Error("Sign in to upload private image assets.");
        if (!response.ok) throw new Error(await response.text());
        setMessage(`Uploading ${index + 1}/${files.length}…`);
      }
      setAssets((await load()).assets); setMessage(`${files.length} image${files.length === 1 ? "" : "s"} uploaded.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image upload failed"); }
    finally { setBusy(false); }
  }

  async function remove(path: string) {
    if (!window.confirm("Delete this image?")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/media/images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), credentials: "same-origin" });
      if (!response.ok) throw new Error(await response.text());
      setAssets((current) => current.filter((asset) => asset.path !== path));
      setMessage("Image deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image delete failed"); }
    finally { setBusy(false); }
  }

  return <div className="stack-md">
    <label className="button secondary" htmlFor="image-asset-file">{busy ? "Uploading…" : "Upload images"}</label>
    <input id="image-asset-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void upload(files); event.currentTarget.value = ""; }} />
    <p className="muted text-xs">JPG, PNG, WebP or GIF · maximum 15 MB · private owner storage</p>
    {message ? <p className="muted" role="status">{message}</p> : null}
    {assets.length ? <div className="asset-grid">{assets.map((asset) => <div className="asset-card" key={asset.path}><a href={asset.url} target="_blank" rel="noreferrer"><Image src={asset.url} alt="Uploaded history asset" width={320} height={180} unoptimized /><span>{asset.path.split("/").pop()}</span></a><button className="button secondary asset-delete" type="button" onClick={() => void remove(asset.path)} disabled={busy}>Delete</button></div>)}</div> : <p className="muted">No uploaded images yet.</p>}
  </div>;
}
