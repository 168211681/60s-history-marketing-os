import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlatformCopyButtons } from "../src/components/platform-matrix";
import {
  buildAssetPath,
  isAllowedPart,
  isScopedAssetPath,
  maxAssetBytes,
  multipartPlan,
  partBytes,
  uploadAllowed,
  validMultipartParts,
} from "../src/lib/clipforge/assets";
import { commitUploadedAsset } from "../src/lib/clipforge/commit-asset";
import { r2Configured, signPutObject, startMultipartUpload } from "../src/lib/clipforge/r2";
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
  assert.equal(uploadAllowed("master_video", "video/mp4", maxAssetBytes), true);
  assert.equal(uploadAllowed("master_video", "video/mp4", maxAssetBytes + 1), false);
  assert.equal(uploadAllowed("thumbnail", "video/mp4", 100), false);
  assert.equal(uploadAllowed("master_video", "image/png", 100), false);
  assert.equal(uploadAllowed("thumbnail", "image/webp", 2048), true);
  assert.equal(multipartPlan(partBytes + 1)?.partCount, 2);
  assert.equal(multipartPlan(maxAssetBytes)?.partCount, 64);
  assert.equal(multipartPlan(maxAssetBytes + 1), null);
  assert.equal(isAllowedPart(1, 100), true);
  assert.equal(isAllowedPart(2, 100), false);
  assert.equal(isAllowedPart(65, maxAssetBytes), false);
  const parts = validMultipartParts([{ partNumber: 1, etag: "a".repeat(32) }], 100);
  assert.equal(parts?.[0]?.etag, `"${"a".repeat(32)}"`);
  assert.equal(validMultipartParts([{ partNumber: 2, etag: "a".repeat(32) }], 100), null);
  assert.equal(validMultipartParts([{ partNumber: 1, etag: "not-an-etag" }], 100), null);
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

test("the pending migration does not touch Supabase Storage", () => {
  const migration = readFileSync("supabase/migrations/20261006210730_clipforge_distribution_assets.sql", "utf8");
  assert.doesNotMatch(migration, /storage\.objects/);
  assert.doesNotMatch(migration, /storage\.buckets/);
  assert.doesNotMatch(migration, /storage\.foldername/);
  assert.doesNotMatch(migration, /alter table storage/i);
  assert.match(migration, /storage_provider text not null default 'r2'/);
  assert.match(migration, /check \(storage_bucket = 'clipforge-assets'\)/);
});

test("browser code never receives R2 credentials", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(path);
    }
  };
  walk("src");
  const clients = files.filter((file) => /["']use client["']/.test(readFileSync(file, "utf8")));
  assert.ok(clients.length > 0);
  for (const file of clients) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|R2_ACCOUNT_ID/);
  }
  const manager = readFileSync("src/components/asset-manager.tsx", "utf8");
  assert.doesNotMatch(manager, /tus-js-client|getSession|supabase\.storage/);
  assert.match(manager, /assets\/upload\/part/);
  assert.match(manager, /type="file"/);
});

test("stored metadata is recorded only after the object size matches", async () => {
  const removed: string[] = [];
  const saved = await commitUploadedAsset({
    async size() { return 12; },
    async remove(key) { removed.push(key); return true; },
  }, "owned/key", 12, async () => ({ id: "asset-1" }));
  assert.deepEqual(saved, { ok: true, id: "asset-1" });
  const mismatch = await commitUploadedAsset({
    async size() { return 11; },
    async remove(key) { removed.push(key); return true; },
  }, "owned/key", 12, async () => ({ id: "nope" }));
  assert.equal(mismatch.ok, false);
  assert.deepEqual(removed, ["owned/key"]);
  await assert.rejects(commitUploadedAsset({
    async size() { return 12; },
    async remove() { return true; },
  }, "owned/key", 12, async () => { throw new Error("db"); }));
  const orphan = await commitUploadedAsset({
    async size() { return 12; },
    async remove() { return false; },
  }, "orphan-key", 12, async () => { throw new Error("db"); });
  assert.equal(orphan.ok, false);
  if (!orphan.ok) assert.match(orphan.error, /orphan-key/);
});

test("R2 signing does nothing unless server credentials and a scoped key exist", async () => {
  const keys = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    assert.equal(r2Configured(), false);
    assert.equal(await startMultipartUpload(`${owner}/${item}/master_video/file.mp4`, "video/mp4"), null);
    assert.equal(await signPutObject("../escape", "image/jpeg", 10), null);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
