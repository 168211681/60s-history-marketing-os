import test from "node:test";
import assert from "node:assert/strict";
import { storeVideoArtifactFromUrl } from "../src/lib/video/artifacts";

test("provider artifacts are copied into private storage before use", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    calls.push(String(input));
    if (calls.length === 1) return new Response(new Uint8Array([0, 1, 2]), { headers: { "content-type": "video/mp4" } });
    if (calls.length === 2) return new Response(null, { status: 200 });
    return Response.json({ signedURL: "/object/sign/video-artifacts/private.mp4" });
  };

  try {
    const result = await storeVideoArtifactFromUrl("https://provider.example/video.mp4", fetcher);
    assert.match(result.artifactUrl, /^https:\/\/example\.supabase\.co\/storage\/v1/);
    assert.equal(calls.length, 3);
    assert.match(calls[1], /\/storage\/v1\/object\/video-artifacts\//);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("provider artifact URL must be HTTPS", async () => {
  await assert.rejects(
    storeVideoArtifactFromUrl("http://provider.example/video.mp4"),
    /VIDEO_ARTIFACT_INVALID_URL/,
  );
});
