import test from "node:test";
import assert from "node:assert/strict";
import { decodeImageBase64, deleteImageAsset, uploadImageAsset } from "../src/lib/media/assets";

test("base64 image payloads decode and reject malformed data", () => {
  const encoded = Buffer.from("tiny-image").toString("base64");
  assert.deepEqual([...decodeImageBase64(encoded)], [...Buffer.from("tiny-image")]);
  assert.throws(() => decodeImageBase64("not-base64"), /IMAGE_ASSET_INVALID_BASE64/);
});

test("image upload stores bytes under the owner path and signs the object", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  try {
    const result = await uploadImageAsset("owner-1", new Uint8Array([1, 2, 3]), "image/png", async (input, init) => {
      calls.push({ input: String(input), init });
      if (String(input).includes("/sign/")) return new Response(JSON.stringify({ signedURL: "/object/sign/image-assets/owner-1/test.png" }), { status: 200 });
      return new Response(null, { status: 200 });
    });
    assert.match(result.path, /^owner-1\/\d{4}-\d{2}-\d{2}\/.+\.png$/);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init?.method, "POST");
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("image deletion only targets paths owned by the current owner", async () => {
  const calls: string[] = [];
  await assert.rejects(
    deleteImageAsset("owner-1", "owner-2/image.png", async (input) => {
      calls.push(String(input));
      return new Response(null, { status: 200 });
    }),
    /IMAGE_ASSET_INVALID_PATH/,
  );
  assert.equal(calls.length, 0);
});

test("image deletion removes the requested private storage object", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  try {
    await deleteImageAsset("owner-1", "owner-1/2026-09-20/image.png", async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(null, { status: 200 });
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].input, /\/storage\/v1\/object\/image-assets\/owner-1\/2026-09-20\/image\.png$/);
    assert.equal(calls[0].init?.method, "DELETE");
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
