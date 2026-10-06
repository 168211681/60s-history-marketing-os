import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlatformCopyButtons } from "../src/components/platform-matrix";
import { buildAssetPath, isScopedAssetPath, resumableUploadEndpoint } from "../src/lib/clipforge/assets";
import {
  applyPlatformPatch,
  distributionSummary,
  isHttpsUrl,
  parsePlatformPostPatch,
  platformCopyAll,
  queueMembership,
} from "../src/lib/clipforge/distribution";

const owner = "10000000-0000-4000-8000-000000000001";
const item = "d1000000-0000-4000-8000-000000000011";
const blank = {
  status: "not_started" as const,
  title: "",
  caption: "",
  hashtags: "",
  scheduledAt: null,
  publishedAt: null,
  postUrl: null,
  platformPostId: null,
};

test("storage paths stay inside the owner and content item", () => {
  const path = buildAssetPath(owner, item, "master_video", "../secret/final..mp4", "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(path, `${owner}/${item}/master_video/550e8400-e29b-41d4-a716-446655440000-final.mp4`);
  assert.equal(isScopedAssetPath(path ?? "", owner, item, "master_video"), true);
  assert.equal(isScopedAssetPath(`${owner}/${item}/master_video/../file.mp4`, owner, item, "master_video"), false);
  assert.equal(isScopedAssetPath(`${owner}/${item}/thumbnail/file.mp4`, owner, item, "master_video"), false);
  assert.equal(isScopedAssetPath(`other/${item}/master_video/file.mp4`, owner, item, "master_video"), false);
  assert.equal(isScopedAssetPath(`${owner}/${owner}/master_video/file.mp4`, owner, item, "master_video"), false);
  assert.equal(isScopedAssetPath(`${owner}/${item}/master_video/file.mp4/extra`, owner, item, "master_video"), false);
  assert.equal(isScopedAssetPath(`${owner}\\${item}\\master_video\\file.mp4`, owner, item, "master_video"), false);
  assert.equal(isScopedAssetPath(`${owner}/${item}/master_video/%2e%2e.mp4`, owner, item, "master_video"), false);
  assert.equal(buildAssetPath("not-a-uuid", item, "thumbnail", "cover.jpg"), null);
  assert.equal(resumableUploadEndpoint("https://haqpqifxlqpihkmhkwdu.supabase.co"), "https://haqpqifxlqpihkmhkwdu.storage.supabase.co/storage/v1/upload/resumable");
  assert.equal(resumableUploadEndpoint("https://evil.example/storage"), null);
  assert.equal(resumableUploadEndpoint("not a url"), null);
});

test("platform copy rejects unsafe URLs and missing schedule times", () => {
  assert.equal(isHttpsUrl("https://youtu.be/abc123"), true);
  assert.equal(isHttpsUrl("http://example.com/watch"), false);
  assert.equal(isHttpsUrl("https://example.com/a b"), false);
  assert.equal(isHttpsUrl("javascript:alert(1)"), false);
  assert.equal(parsePlatformPostPatch({ postUrl: "http://example.com" }), null);
  assert.equal(parsePlatformPostPatch({ status: "viral" }), null);
  assert.equal(parsePlatformPostPatch({}), null);
  assert.equal(applyPlatformPatch(blank, { status: "scheduled" }, "2026-10-07T00:00:00.000Z"), null);
  const published = applyPlatformPatch(blank, { status: "published" }, "2026-10-07T00:00:00.000Z");
  assert.equal(published?.publishedAt, "2026-10-07T00:00:00.000Z");
  const ready = applyPlatformPatch(blank, { status: "ready", postUrl: "https://example.com/post" }, "2026-10-07T00:00:00.000Z");
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.postUrl, "https://example.com/post");
});

test("distribution progress counts published and skipped as complete", () => {
  assert.deepEqual(distributionSummary(["not_started", "ready", "scheduled", "published"]), {
    complete: 1,
    remaining: 2,
    total: 4,
    label: "1/4",
  });
  assert.deepEqual(distributionSummary(["published", "skipped", "published", "skipped"]), {
    complete: 4,
    remaining: 0,
    total: 4,
    label: "4/4",
  });
  const now = Date.parse("2026-10-07T00:00:00.000Z");
  const membership = queueMembership([
    { status: "ready", publishedAt: null },
    { status: "scheduled", publishedAt: null },
    { status: "published", publishedAt: "2026-09-20T00:00:00.000Z" },
    { status: "skipped", publishedAt: null },
  ], now);
  assert.deepEqual(membership, { needsAction: true, scheduled: true, recentlyPublished: true });
  assert.equal(queueMembership([{ status: "published", publishedAt: "2026-01-01T00:00:00.000Z" }], now).recentlyPublished, false);
  assert.equal(queueMembership([{ status: "skipped", publishedAt: null }], now).needsAction, false);
});

test("copy controls render title, caption, hashtags, and combined text", () => {
  const post = { title: "Siege", caption: "One minute.", hashtags: "#history" };
  assert.equal(platformCopyAll(post), "Siege\n\nOne minute.\n\n#history");
  assert.equal(platformCopyAll({ title: "", caption: "Only caption", hashtags: "" }), "Only caption");
  const html = renderToStaticMarkup(createElement(PlatformCopyButtons, { post, onCopy() {} }));
  assert.match(html, /Copy title/);
  assert.match(html, /Copy caption/);
  assert.match(html, /Copy hashtags/);
  assert.match(html, /Copy all/);
  const distribution = readFileSync("src/app/distribution/page.tsx", "utf8");
  const detail = readFileSync("src/app/library/[id]/page.tsx", "utf8");
  assert.doesNotMatch(distribution, /Not yet implemented/);
  assert.match(distribution, /Cross-post queue/);
  assert.match(detail, /Script/);
  assert.match(detail, /AI Prompts/);
  assert.match(detail, /Not yet implemented/);
  assert.match(detail, /AssetManager/);
  assert.match(detail, /PlatformMatrix/);
});
