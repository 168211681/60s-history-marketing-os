import assert from "node:assert/strict";
import test from "node:test";
import { isMcpAuthorized } from "../src/lib/ai/mcp-auth";
import { canAdvanceScriptStatus } from "../src/lib/data/script-status";
import { canAdvanceProductionWorkflow } from "../src/lib/data/production-workflow";
import { higgsfieldProvider } from "../src/lib/video/higgsfield";
import { videoProvider } from "../src/lib/video";
import { storeVideoArtifact } from "../src/lib/video/artifacts";

test("MCP authorization requires the configured bearer secret", () => {
  assert.equal(isMcpAuthorized("Bearer test-secret", "test-secret"), true);
  assert.equal(isMcpAuthorized("Bearer wrong", "test-secret"), false);
  assert.equal(isMcpAuthorized(null, "test-secret"), false);
  assert.equal(isMcpAuthorized("Bearer test-secret", undefined), false);
});

test("script approval follows the human review sequence", () => {
  assert.equal(canAdvanceScriptStatus("draft", "reviewed"), true);
  assert.equal(canAdvanceScriptStatus("reviewed", "approved"), true);
  assert.equal(canAdvanceScriptStatus("draft", "approved"), false);
  assert.equal(canAdvanceScriptStatus("approved", "reviewed"), false);
});

test("production workflow requires private upload before human publication", () => {
  assert.equal(canAdvanceProductionWorkflow("queued", "rendering"), true);
  assert.equal(canAdvanceProductionWorkflow("rendered", "uploaded_private"), true);
  assert.equal(canAdvanceProductionWorkflow("uploaded_private", "published"), true);
  assert.equal(canAdvanceProductionWorkflow("queued", "published"), false);
  assert.equal(canAdvanceProductionWorkflow("published", "queued"), false);
});

test("Higgsfield remains unavailable without server credentials", async () => {
  const originalId = process.env.HF_API_KEY_ID;
  const originalSecret = process.env.HF_API_KEY_SECRET;
  const originalEnabled = process.env.HIGGSFIELD_GENERATION_ENABLED;
  delete process.env.HF_API_KEY_ID;
  delete process.env.HF_API_KEY_SECRET;
  delete process.env.HIGGSFIELD_GENERATION_ENABLED;
  const provider = higgsfieldProvider();
  assert.equal(provider.configured, false);
  await assert.rejects(() => provider.submit({ draftId: "draft", title: "title", hook: "hook", scriptBody: "body", sceneCues: "", captionText: "" }), /HIGGSFIELD_NOT_CONFIGURED/);
  if (originalId === undefined) delete process.env.HF_API_KEY_ID; else process.env.HF_API_KEY_ID = originalId;
  if (originalSecret === undefined) delete process.env.HF_API_KEY_SECRET; else process.env.HF_API_KEY_SECRET = originalSecret;
  if (originalEnabled === undefined) delete process.env.HIGGSFIELD_GENERATION_ENABLED; else process.env.HIGGSFIELD_GENERATION_ENABLED = originalEnabled;
});

test("video provider selection keeps unimplemented providers unavailable", async () => {
  const previous = process.env.VIDEO_PROVIDER;
  process.env.VIDEO_PROVIDER = "huggingface";
  try {
    const provider = videoProvider();
    assert.equal(provider.name, "huggingface");
    assert.equal(provider.configured, false);
    await assert.rejects(() => provider.submit({ draftId: "draft", title: "title", hook: "hook", scriptBody: "body", sceneCues: "", captionText: "" }), /HUGGINGFACE_NOT_CONFIGURED/);
  } finally {
    if (previous === undefined) delete process.env.VIDEO_PROVIDER;
    else process.env.VIDEO_PROVIDER = previous;
  }
});

test("video artifacts require server-only storage configuration", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await assert.rejects(() => storeVideoArtifact(new Uint8Array([1])), /VIDEO_ARTIFACT_STORAGE_NOT_CONFIGURED/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("Higgsfield submits an approved script as a server-side request", async () => {
  const originalId = process.env.HF_API_KEY_ID;
  const originalSecret = process.env.HF_API_KEY_SECRET;
  const originalEnabled = process.env.HIGGSFIELD_GENERATION_ENABLED;
  process.env.HF_API_KEY_ID = "key-id";
  process.env.HF_API_KEY_SECRET = "key-secret";
  process.env.HIGGSFIELD_GENERATION_ENABLED = "true";
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    captured = init;
    return new Response(JSON.stringify({ request_id: "hf-request-1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await higgsfieldProvider().submit({ draftId: "draft", title: "A title", hook: "A hook", scriptBody: "Body", sceneCues: "Scenes", captionText: "Captions" });
    assert.deepEqual(result, { externalJobId: "hf-request-1" });
    assert.equal((captured?.headers as Record<string, string>).Authorization, "Key key-id:key-secret");
    assert.match(String(captured?.body), /A title/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.HF_API_KEY_ID; else process.env.HF_API_KEY_ID = originalId;
    if (originalSecret === undefined) delete process.env.HF_API_KEY_SECRET; else process.env.HF_API_KEY_SECRET = originalSecret;
    if (originalEnabled === undefined) delete process.env.HIGGSFIELD_GENERATION_ENABLED; else process.env.HIGGSFIELD_GENERATION_ENABLED = originalEnabled;
  }
});

test("Higgsfield status returns a validated completed artifact", async () => {
  const originalId = process.env.HF_API_KEY_ID;
  const originalSecret = process.env.HF_API_KEY_SECRET;
  const originalEnabled = process.env.HIGGSFIELD_GENERATION_ENABLED;
  process.env.HF_API_KEY_ID = "key-id";
  process.env.HF_API_KEY_SECRET = "key-secret";
  process.env.HIGGSFIELD_GENERATION_ENABLED = "true";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /requests\/job-1\/status$/);
    return new Response(JSON.stringify({ status: "completed", video: { url: "https://cdn.example/video.mp4" } }), { status: 200 });
  };
  try {
    assert.deepEqual(await higgsfieldProvider().status("job-1"), { status: "completed", artifactUrl: "https://cdn.example/video.mp4" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.HF_API_KEY_ID; else process.env.HF_API_KEY_ID = originalId;
    if (originalSecret === undefined) delete process.env.HF_API_KEY_SECRET; else process.env.HF_API_KEY_SECRET = originalSecret;
    if (originalEnabled === undefined) delete process.env.HIGGSFIELD_GENERATION_ENABLED; else process.env.HIGGSFIELD_GENERATION_ENABLED = originalEnabled;
  }
});
