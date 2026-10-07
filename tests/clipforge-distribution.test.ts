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
  resolveUploadPath,
  uploadAllowed,
  validMultipartParts,
} from "../src/lib/clipforge/assets";
import { commitUploadedAsset } from "../src/lib/clipforge/commit-asset";
import { r2Configured, signPutObject, startMultipartUpload } from "../src/lib/clipforge/r2";
import {
  DirectUploadError,
  partProgress,
  sequentialSigner,
  uploadMasterObject,
  uploadRetryDelaysMs,
  uploadThumbnailObject,
  uploadWithRetry,
} from "../src/lib/clipforge/upload-retry";
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
  const thumb = `${owner}/${item}/thumbnail/cover.jpg`;
  assert.equal(resolveUploadPath(owner, item, "thumbnail", "cover.jpg", thumb), thumb);
  assert.equal(resolveUploadPath(owner, item, "master_video", "clip.mp4", `${owner}/${item}/master_video/clip.mp4`), null);
  assert.equal(resolveUploadPath(owner, item, "thumbnail", "cover.jpg", `${owner}/${item}/master_video/clip.mp4`), null);
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
  assert.doesNotMatch(migration, /content_assets_update_own/);
  assert.doesNotMatch(migration, /grant update \([^)]*\) on public\.content_assets to authenticated/);
  assert.match(migration, /grant delete on public\.content_assets to authenticated/);
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
    assert.doesNotMatch(source, /R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|R2_ACCOUNT_ID|NEXT_PUBLIC_R2/);
    assert.doesNotMatch(source, /clipforge\/r2|lib\/clipforge\/r2/);
  }
  const manager = readFileSync("src/components/asset-manager.tsx", "utf8");
  assert.doesNotMatch(manager, /tus-js-client|getSession|supabase\.storage/);
  assert.match(manager, /assets\/upload\/part/);
  assert.match(manager, /uploadMasterObject/);
  assert.match(manager, /uploadThumbnailObject/);
  assert.match(manager, /type="file"/);
  const r2 = readFileSync("src/lib/clipforge/r2.ts", "utf8");
  assert.match(r2, /import ["']server-only["']/);
  assert.doesNotMatch(readFileSync(".env.example", "utf8"), /NEXT_PUBLIC_R2/);
});

test("stored metadata is recorded only after size and content type match", async () => {
  const removed: string[] = [];
  const key = `${owner}/${item}/master_video/file.mp4`;
  const saved = await commitUploadedAsset({
    async inspect() { return { size: 12, contentType: "video/mp4" }; },
    async remove(path) { removed.push(path); return true; },
  }, key, 12, "video/mp4", async () => ({ id: "asset-1" }));
  assert.deepEqual(saved, { ok: true, id: "asset-1" });
  let inserted = 0;
  const mismatch = await commitUploadedAsset({
    async inspect() { return { size: 11, contentType: "video/mp4" }; },
    async remove(path) { removed.push(path); return true; },
  }, key, 12, "video/mp4", async () => { inserted += 1; return { id: "nope" }; });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.match(mismatch.error, /size did not match/);
  const typeMismatch = await commitUploadedAsset({
    async inspect() { return { size: 12, contentType: "image/png" }; },
    async remove(path) { removed.push(path); return true; },
  }, key, 12, "video/mp4", async () => { inserted += 1; return { id: "nope" }; });
  assert.equal(typeMismatch.ok, false);
  if (!typeMismatch.ok) {
    assert.equal(typeMismatch.status, 409);
    assert.match(typeMismatch.error, /type did not match/);
  }
  assert.equal(inserted, 0);
  assert.deepEqual(removed, [key, key]);
  const orphanMismatch = await commitUploadedAsset({
    async inspect() { return { size: 12, contentType: "text/plain" }; },
    async remove() { return false; },
  }, "orphan-type", 12, "image/jpeg", async () => ({ id: "x" }));
  assert.equal(orphanMismatch.ok, false);
  if (!orphanMismatch.ok) assert.match(orphanMismatch.error, /orphan-type/);
  await assert.rejects(commitUploadedAsset({
    async inspect() { return { size: 12, contentType: "video/mp4" }; },
    async remove() { return true; },
  }, key, 12, "video/mp4", async () => { throw new Error("db"); }));
  const orphan = await commitUploadedAsset({
    async inspect() { return { size: 12, contentType: "video/mp4" }; },
    async remove() { return false; },
  }, "orphan-key", 12, "video/mp4", async () => { throw new Error("db"); });
  assert.equal(orphan.ok, false);
  if (!orphan.ok) assert.match(orphan.error, /orphan-key/);
});

test("direct uploads retry one part or thumbnail without restarting finished work", async () => {
  assert.deepEqual([...uploadRetryDelaysMs], [0, 1000, 3000, 5000, 10000]);
  assert.equal(partProgress(8, 0, 16), 50);
  const etag = `"${"a".repeat(32)}"`;
  const once = await uploadWithRetry({
    sign: async () => "https://example.test/part-1",
    put: async (url) => {
      assert.equal(url, "https://example.test/part-1");
      return etag;
    },
  });
  assert.equal(once, etag);

  const signed: number[] = [];
  const uploaded: number[] = [];
  const slept: number[] = [];
  let aborted = false;
  const parts = await uploadMasterObject({
    partCount: 2,
    delays: [0, 1000, 3000],
    sleep: async (ms) => { slept.push(ms); },
    signPart: async (partNumber) => {
      signed.push(partNumber);
      return `https://example.test/${partNumber}/${signed.length}`;
    },
    putPart: async (url, partNumber) => {
      uploaded.push(partNumber);
      assert.match(url, new RegExp(`/${partNumber}/`));
      if (partNumber === 2 && uploaded.filter((value) => value === 2).length === 1) {
        throw new DirectUploadError("storage busy", 503);
      }
      return etag;
    },
    complete: async (done) => { assert.deepEqual(done.map((part) => part.partNumber), [1, 2]); },
    abort: async () => { aborted = true; },
  });
  assert.equal(aborted, false);
  assert.deepEqual(uploaded, [1, 2, 2]);
  assert.deepEqual(signed, [1, 2, 2]);
  assert.deepEqual(slept, [1000]);
  assert.deepEqual(parts.map((part) => part.partNumber), [1, 2]);

  const exhausted: number[] = [];
  let abortCount = 0;
  let completeCount = 0;
  await assert.rejects(uploadMasterObject({
    partCount: 2,
    delays: [0, 1000],
    sleep: async () => {},
    signPart: async (partNumber) => `https://example.test/${partNumber}`,
    putPart: async (_url, partNumber) => {
      exhausted.push(partNumber);
      if (partNumber === 2) throw new DirectUploadError("still down", 500);
      return etag;
    },
    complete: async () => { completeCount += 1; },
    abort: async () => { abortCount += 1; },
  }));
  assert.equal(abortCount, 1);
  assert.equal(completeCount, 0);
  assert.deepEqual(exhausted, [1, 2, 2]);

  let forbiddenSigns = 0;
  await assert.rejects(uploadWithRetry({
    delays: uploadRetryDelaysMs,
    sleep: async () => { throw new Error("validation failures are not retried"); },
    sign: async () => { forbiddenSigns += 1; return "https://example.test/denied"; },
    put: async () => { throw new DirectUploadError("forbidden", 403); },
  }));
  assert.equal(forbiddenSigns, 1);

  const thumbUrls: string[] = [];
  await uploadThumbnailObject({
    delays: [0, 1000],
    sleep: async (ms) => { assert.equal(ms, 1000); },
    sign: sequentialSigner("https://example.test/thumb-initial", async () => "https://example.test/thumb-fresh"),
    put: async (url) => {
      thumbUrls.push(url);
      if (thumbUrls.length === 1) throw new DirectUploadError("network", null);
    },
  });
  assert.deepEqual(thumbUrls, ["https://example.test/thumb-initial", "https://example.test/thumb-fresh"]);
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
