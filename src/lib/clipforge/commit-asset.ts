import { normalizeMimeType } from "./assets";

export async function commitUploadedAsset(
  store: {
    inspect: (key: string) => Promise<{ size: number; contentType: string } | null | "error">;
    remove: (key: string) => Promise<boolean>;
  },
  key: string,
  sizeBytes: number,
  mimeType: string,
  insert: () => Promise<{ id: string } | null>,
): Promise<{ ok: true; id: string } | { ok: false; status: 404 | 409 | 500 | 503; error: string }> {
  const actual = await store.inspect(key);
  if (actual === "error") return { ok: false, status: 503, error: "Storage could not be checked." };
  if (actual === null) return { ok: false, status: 409, error: "The upload did not finish in storage, so no record was saved." };
  const sizeMatches = actual.size === sizeBytes;
  const typeMatches = normalizeMimeType(actual.contentType) === normalizeMimeType(mimeType) && normalizeMimeType(mimeType).length > 0;
  if (!sizeMatches || !typeMatches) {
    const removed = await store.remove(key);
    const reason = !sizeMatches
      ? "The stored file size did not match, so no record was saved."
      : "The stored file type did not match, so no record was saved.";
    if (!removed) return { ok: false, status: 500, error: `${reason} Orphan object remains at ${key}.` };
    return { ok: false, status: 409, error: reason };
  }
  try {
    const saved = await insert();
    if (!saved) {
      const removed = await store.remove(key);
      if (!removed) {
        return { ok: false, status: 500, error: `Content item was not found. Orphan object remains at ${key}.` };
      }
      return { ok: false, status: 404, error: "Content item was not found. The uploaded object was removed." };
    }
    return { ok: true, id: saved.id };
  } catch (error) {
    const removed = await store.remove(key);
    if (!removed) {
      return { ok: false, status: 500, error: `The file reached storage but the record was not saved. Orphan object remains at ${key}.` };
    }
    throw error;
  }
}