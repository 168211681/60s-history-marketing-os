import assert from "node:assert/strict";
import test from "node:test";
import { isMcpAuthorized } from "../src/lib/ai/mcp-auth";
import { canAdvanceScriptStatus } from "../src/lib/data/script-status";
import { canAdvanceProductionWorkflow } from "../src/lib/data/production-workflow";
import { higgsfieldProvider } from "../src/lib/video/higgsfield";
import { videoProvider } from "../src/lib/video";
import { storeVideoArtifact } from "../src/lib/video/artifacts";
import { summarize } from "../src/lib/analytics";
import { contentGenerationPrompt, type OwnerContext } from "../src/lib/ai/mcp-data";
import { nextExperimentMessage, type ContentExperimentRecord } from "../src/lib/data/experiments";
import { sampleVideos, sampleWeeklyViews } from "../src/lib/sample-data";
import { fetchPublicMarketChannel, normalizeYouTubeChannelId } from "../src/lib/youtube/public-market";

test("MCP authorization requires the configured bearer secret", () => {
  assert.equal(isMcpAuthorized("Bearer test-secret", "test-secret"), true);
  assert.equal(isMcpAuthorized("Bearer wrong", "test-secret"), false);
  assert.equal(isMcpAuthorized(null, "test-secret"), false);
  assert.equal(isMcpAuthorized("Bearer test-secret", undefined), false);
});

test("content generation prompt is copyable and labels analytics as evidence", () => {
  const context: OwnerContext = {
    ownerId: "owner-1",
    channelId: "channel-1",
    channelTitle: "60s History",
    period: { from: "2026-08-22", through: "2026-09-18" },
    workspace: {
      source: "live",
      channelTitle: "60s History",
      period: "Aug 22 – Sep 18, 2026",
      videos: sampleVideos,
      summary: summarize(sampleVideos),
      weeklyViews: sampleWeeklyViews,
      lastSyncedAt: "2026-09-18T00:00:00.000Z",
    },
  };
  const result = contentGenerationPrompt(context, { topic: "Ancient navigation", language: "th" });
  assert.equal(result.source, "stored_youtube_analytics");
  assert.match(result.prompt, /Requested topic: Ancient navigation/);
  assert.match(result.prompt, /evidence only/);
  assert.match(result.prompt, /complete spoken script for about 60 seconds/);
  assert.equal(result.evidence.topVideos[0].title, "One day inside a Roman legion");
});

test("public market adapter normalizes YouTube channel and video snapshots", async () => {
  const previousKey = process.env.YOUTUBE_DATA_API_KEY;
  process.env.YOUTUBE_DATA_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/channels?")) return new Response(JSON.stringify({ items: [{ id: "UCtest", snippet: { title: "Competitor" }, contentDetails: { relatedPlaylists: { uploads: "PLtest" } } }] }), { status: 200 });
    if (url.includes("/playlistItems?")) return new Response(JSON.stringify({ items: [{ contentDetails: { videoId: "video-1" } }] }), { status: 200 });
    assert.match(url, /\/videos\?/);
    return new Response(JSON.stringify({ items: [{ id: "video-1", snippet: { title: "Public video", publishedAt: "2026-09-01T00:00:00Z" }, contentDetails: { duration: "PT1M2S" }, statistics: { viewCount: "1200", likeCount: "30", commentCount: "4" } }] }), { status: 200 });
  };
  try {
    const result = await fetchPublicMarketChannel("UCtest");
    assert.equal(result.title, "Competitor");
    assert.deepEqual(result.videos[0], { youtubeVideoId: "video-1", title: "Public video", publishedAt: "2026-09-01T00:00:00Z", durationSeconds: 62, views: 1200, likes: 30, comments: 4 });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.YOUTUBE_DATA_API_KEY; else process.env.YOUTUBE_DATA_API_KEY = previousKey;
  }
});

test("public market input accepts a channel ID or /channel/ URL only", () => {
  assert.equal(normalizeYouTubeChannelId("UCtest"), "UCtest");
  assert.equal(normalizeYouTubeChannelId("https://www.youtube.com/channel/UCtest/"), "UCtest");
  assert.equal(normalizeYouTubeChannelId("https://youtube.com/@creator"), "@creator");
  assert.equal(normalizeYouTubeChannelId("https://example.com/channel/UCtest"), null);
});

test("experiment recommendation keeps active tests focused", () => {
  const active = { topic: "Ancient navigation", status: "planned" } as ContentExperimentRecord;
  assert.match(nextExperimentMessage([active]), /Finish the planned experiment/);
  assert.match(nextExperimentMessage([]), /Plan a new comparable hook experiment/);
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
  assert.equal(canAdvanceProductionWorkflow("failed", "queued"), true);
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
