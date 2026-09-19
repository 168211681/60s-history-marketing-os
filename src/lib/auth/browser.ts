"use client";

import { createBrowserClient } from "@supabase/ssr";

export function browserAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Authentication is not configured");
  return createBrowserClient(url, key);
}
