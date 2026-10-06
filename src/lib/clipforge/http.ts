import { NextResponse } from "next/server";

export function clipforgeError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "23505") return NextResponse.json({ error: "That code or content key is already used." }, { status: 409 });
  if (code === "23503") return NextResponse.json({ error: "The owner identity or project is not available." }, { status: 409 });
  if (code === "23514") return NextResponse.json({ error: "A field is outside the allowed values." }, { status: 400 });
  console.error("clipforge write failed", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ error: "Could not save that record." }, { status: 500 });
}
