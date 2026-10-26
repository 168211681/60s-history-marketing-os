import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { bulkEligible, parseBulkConfirmation, parseBulkSelection } from "../src/lib/clipforge/bulk-review";
import { bulkReviewPost } from "../src/lib/clipforge/bulk-review-http";
import { BulkReviewConflict } from "../src/lib/clipforge/bulk-review-store";
import { reviewFixtureData, reviewId } from "./fixtures/review-queue-data";
import { parseReviewFilters } from "../src/lib/clipforge/review-queue";

const valid = { requestId: reviewId(500), action: "accept", items: [{ contentItemId: reviewId(1), suggestionId: reviewId(101), version: "a".repeat(64), fields: ["topic"] }] };
test("bulk payloads require unique UUIDs, bounded batches, explicit fields, and no client owner or AI values", () => {
  assert.ok(parseBulkConfirmation(valid));
  for (const value of [null, {}, { ...valid, ownerId: reviewId(900) }, { ...valid, action: "publish" }, { ...valid, requestId: "invalid" },
    { ...valid, items: [] }, { ...valid, items: Array(11).fill(valid.items[0]) }, { ...valid, items: [...valid.items, ...valid.items] },
    ...[{ contentItemId: "bad" }, { suggestionId: "bad" }, { version: "bad" }, { fields: [] }, { fields: ["topic", "topic"] }, { fields: ["format"] }, { suggestedTopic: "forged" }].map((change) => ({ ...valid, items: [{ ...valid.items[0], ...change }] })),
    { ...valid, items: [valid.items[0], { ...valid.items[0], contentItemId: reviewId(2) }] }, { ...valid, action: "reject" },
  ]) assert.equal(parseBulkConfirmation(value), null);
  assert.ok(parseBulkConfirmation({ ...valid, action: "reject", items: [{ ...valid.items[0], fields: [] }] }));
  assert.ok(parseBulkSelection({ action: "accept", items: [{ contentItemId: reviewId(1), fields: [] }] }));
  assert.equal(parseBulkSelection({ action: "accept", items: [{ contentItemId: reviewId(1), fields: [], suggestionId: reviewId(101) }] }), null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ ...valid.items[0], contentItemId: reviewId(i + 1), suggestionId: reviewId(i + 101) }));
  assert.ok(parseBulkConfirmation({ ...valid, items: ten }));
});
test("only current pending queue cards are eligible for page selection", async () => {
  const data = await reviewFixtureData(parseReviewFilters({})!);
  assert.deepEqual(data.items.filter(bulkEligible).map((i) => i.id), [reviewId(1)]);
});

test("both real HTTP handlers enforce origin and authenticated owner before reading a body or calling stores", async () => {
  for (const confirm of [false, true]) {
    let calls = 0;
    const deps = { origin: () => "https://clip.test", owner: async () => ({ id: reviewId(900) }), configured: () => true,
      preview: async (id: string) => { calls++; assert.equal(id, reviewId(900)); return { ok: true }; },
      confirm: async (id: string) => { calls++; assert.equal(id, reviewId(900)); return { ok: true }; } };
    const request = (origin: string | null, body: unknown = valid) => new NextRequest("https://clip.test/api/test", { method: "POST", headers: origin ? { origin } : {}, body: JSON.stringify(body) });
    assert.equal((await bulkReviewPost(request(null), confirm, deps)).status, 403);
    assert.equal((await bulkReviewPost(request("https://evil.test"), confirm, deps)).status, 403);
    assert.equal((await bulkReviewPost(request("https://clip.test"), confirm, { ...deps, owner: async () => null })).status, 401);
    assert.equal((await bulkReviewPost(request("https://clip.test"), confirm, { ...deps, configured: () => false })).status, 503);
    assert.equal((await bulkReviewPost(request("https://clip.test", { ...valid, ownerId: reviewId(901) }), confirm, deps)).status, 400);
    assert.equal(calls, 0);
    const body = confirm ? valid : { action: valid.action, items: valid.items };
    const response = await bulkReviewPost(request("https://clip.test", body), confirm, deps);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(calls, 1);
    const failed = { ...deps, preview: async () => { throw new Error("PRIVATE_DATABASE_CREDENTIAL"); }, confirm: async () => { throw new Error("PRIVATE_DATABASE_CREDENTIAL"); } };
    const failure = await bulkReviewPost(request("https://clip.test", body), confirm, failed);
    assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /PRIVATE_DATABASE/);
    failed.preview = failed.confirm = async () => { throw new BulkReviewConflict(); };
    assert.equal((await bulkReviewPost(request("https://clip.test", body), confirm, failed)).status, 409);
  }
});

test("bulk routes use configured-owner auth and the shared decision helper without inference or publishing", () => {
  for (const route of ["preview", "confirm"]) {
    const source = readFileSync(`src/app/api/content-items/bulk-review/${route}/route.ts`, "utf8");
    assert.match(source, /owner: currentOwner/); assert.match(source, /origin: appOrigin/);
  }
  const store = readFileSync("src/lib/clipforge/bulk-review-store.ts", "utf8");
  assert.match(store, /reviewLockedSuggestion\(client/);
  assert.doesNotMatch(store, /aiProvider|classifyContentItem|fetch\(|publish|set status =/);
});
