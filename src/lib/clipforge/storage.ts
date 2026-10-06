import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/auth/config";
import { assetBucket } from "./assets";

function storageAdmin() {
  const config = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) return null;
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function storageAdminConfigured() {
  return storageAdmin() !== null;
}

export async function storedObjectExists(path: string) {
  const client = storageAdmin();
  if (!client) return null;
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await client.storage.from(assetBucket).list(folder, { search: filename, limit: 20 });
  if (error) return null;
  return data.some((object) => object.name === filename);
}

export async function removeStoredObject(path: string) {
  const client = storageAdmin();
  if (!client) return false;
  const { error } = await client.storage.from(assetBucket).remove([path]);
  return !error;
}

export async function signStoredObjects(paths: readonly string[], expiresIn = 300) {
  const urls = new Map<string, string>();
  const client = storageAdmin();
  if (!client || paths.length === 0) return urls;
  const { data, error } = await client.storage.from(assetBucket).createSignedUrls([...paths], expiresIn);
  if (error || !data) return urls;
  for (const row of data) {
    if (row.path && row.signedUrl && !row.error) urls.set(row.path, row.signedUrl);
  }
  return urls;
}
