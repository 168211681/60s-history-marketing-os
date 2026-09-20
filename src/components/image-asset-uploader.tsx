"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Asset = { path: string; url: string; contentType: string | null; size: number | null; createdAt: string | null };

export function ImageAssetUploader() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load(): Promise<Asset[]> {
    const response = await fetch("/api/media/images", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Could not load image assets");
    return ((await response.json()) as { assets: Asset[] }).assets;
  }

  useEffect(() => {
    void load()
      .then(setAssets)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load image assets"));
  }, []);

  async function upload(file: File) {
    setBusy(true); setMessage(null);
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/media/images", { method: "POST", body, credentials: "same-origin" });
      if (!response.ok) throw new Error(await response.text());
      setAssets(await load()); setMessage("Image uploaded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image upload failed"); }
    finally { setBusy(false); }
  }

  return <div className="stack-md">
    <label className="button secondary" htmlFor="image-asset-file">{busy ? "Uploading…" : "Upload image"}</label>
    <input id="image-asset-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
    <p className="muted text-xs">JPG, PNG, WebP or GIF · maximum 15 MB · private owner storage</p>
    {message ? <p className="muted" role="status">{message}</p> : null}
    {assets.length ? <div className="asset-grid">{assets.map((asset) => <a key={asset.path} href={asset.url} target="_blank" rel="noreferrer"><Image src={asset.url} alt="Uploaded history asset" width={320} height={180} unoptimized /><span>{asset.path.split("/").pop()}</span></a>)}</div> : <p className="muted">No uploaded images yet.</p>}
  </div>;
}
