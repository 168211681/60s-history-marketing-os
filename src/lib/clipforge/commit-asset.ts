export async function commitUploadedAsset(
  store: {
    size: (key: string) => Promise<number | null | "error">;
    remove: (key: string) => Promise<boolean>;
  },
  key: string,
  sizeBytes: number,
  insert: () => Promise<{ id: string } | null>,
): Promise<{ ok: true; id: string } | { ok: false; status: 404 | 409 | 500 | 503; error: string }> {
  const actual = await store.size(key);
  if (actual === "error") return { ok: false, status: 503, error: "Storage could not be checked." };
  if (actual === null) return { ok: false, status: 409, error: "The upload did not finish in storage, so no record was saved." };
  if (actual !== sizeBytes) {
    await store.remove(key);
    return { ok: false, status: 409, error: "The stored file size did not match, so no record was saved." };
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
