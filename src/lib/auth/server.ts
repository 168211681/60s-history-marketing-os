import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { ownerId, supabaseConfig } from "./config";

export async function serverAuth(response?: NextResponse) {
  const config = supabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value, options }) => response?.cookies.set(name, value, options));
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}

export async function currentOwner() {
  const expected = ownerId();
  const client = await serverAuth();
  if (!expected || !client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.id.toLowerCase() !== expected) return null;
  return data.user;
}
