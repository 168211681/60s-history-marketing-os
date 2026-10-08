import { NextResponse } from "next/server";
import { ContentInputError } from "./model";

export function clipforgeError(error: unknown) {
  if (error instanceof ContentInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  const record = typeof error === "object" && error ? error as { code?: string; table?: string } : {};
  const code = record.code ? String(record.code) : "";
  const table = record.table ? String(record.table) : "";
  if (code === "23505" && table === "content_assets") {
    return NextResponse.json({ error: "That content item already has this asset." }, { status: 409 });
  }
  if (code === "23505" && table === "platform_posts") {
    return NextResponse.json({ error: "That platform row already exists." }, { status: 409 });
  }
  if (code === "23505") return NextResponse.json({ error: "That code or content key is already used." }, { status: 409 });
  if (code === "23503") return NextResponse.json({ error: "The owner identity or project is not available." }, { status: 409 });
  if (code === "23514") return NextResponse.json({ error: "A field is outside the allowed values." }, { status: 400 });
  console.error("clipforge write failed", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ error: "Could not save that record." }, { status: 500 });
}
