import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classificationFingerprint, suggestionIsStale } from "../src/lib/clipforge/classification";
import { sourceFromRow } from "../src/lib/clipforge/classification-read";
import { currentSuggestionsSql, reviewContextsSql } from "../src/lib/clipforge/classification-read-sql.mjs";
import { readReviewQueue } from "../src/lib/clipforge/review-queue-read";
import { conciseRationale, parseReviewFilters, reviewConfidence, reviewHref, reviewState } from "../src/lib/clipforge/review-queue";
import { reviewContext, reviewFixtureClient, reviewFixtureData, reviewId, reviewOwner } from "./fixtures/review-queue-data";

const all = parseReviewFilters({})!;

test("queue states preserve reviewed decisions and distinguish stale and historical suggestions", () => {
  assert.equal(reviewState(null), "not_generated");
  assert.equal(reviewState({ status: "pending", stale: false }), "pending");
  assert.equal(reviewState({ status: "pending", stale: true }), "stale");
  for (const status of ["accepted", "rejected", "superseded"] as const) {
    assert.equal(reviewState({ status, stale: true }), status);
    assert.equal(reviewState({ status, stale: false }), status);
  }
  assert.equal(reviewConfidence(null), "Unavailable");
  assert.equal(reviewConfidence(0), "0%");
  assert.equal(reviewConfidence(0.92), "92%");
  assert.ok(conciseRationale("Long rationale ".repeat(100)).length <= 240);
  assert.equal(conciseRationale("  "), "No rationale stored.");
});

test("filters are bounded, reject ambiguous parameters, and preserve context in pagination links", () => {
  assert.deepEqual(all, { state: "all", project: "", q: "", page: 1 });
  for (const params of [{ page: "0" }, { page: "-1" }, { page: "2.2" }, { page: "1000000" }, { q: "a".repeat(201) }, { state: "accept" }, { project: "foreign-or-invalid" }, { state: ["all", "pending"] }, { q: ["one"] }]) {
    assert.equal(parseReviewFilters(params), null);
  }
  const filters = parseReviewFilters({ state: "accepted", project: reviewId(90), q: "  a & b  ", page: "2" })!;
  const url = new URL(reviewHref(filters, { page: 3 }), "https://example.test");
  assert.equal(url.searchParams.get("q"), "a & b");
  assert.equal(url.searchParams.get("project"), reviewId(90));
  assert.equal(url.searchParams.get("state"), "accepted");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(reviewHref(all), "/review");
});

test("queue uses shared fingerprints, actual state totals, and an explicit view allowlist", async () => {
  const data = await reviewFixtureData(all);
  assert.deepEqual(data.totals, { all: 28, pending: 1, stale: 1, accepted: 2, rejected: 1, not_generated: 22, superseded: 1 });
  assert.equal(data.pageCount, 2);
  assert.equal(data.items.length, 20);
  assert.equal(data.items[5].state, "accepted");
  assert.equal(data.items[5].suggestion?.stale, true);
  assert.equal(data.items[4].suggestion, null);
  const json = JSON.stringify(data);
  assert.doesNotMatch(json, /PRIVATE_|provider|sourceFingerprint|source_fingerprint|promptVersion/);
  const source = sourceFromRow(reviewContext(1));
  assert.equal(suggestionIsStale(classificationFingerprint(source), classificationFingerprint(sourceFromRow(reviewContext(1)))), false);
  assert.notEqual(classificationFingerprint(source), classificationFingerprint({ ...source, topic: "Edited after review" }));
});

test("title and project filters scope totals; state filters and pagination select the right clips", async () => {
  const pending = await reviewFixtureData({ ...all, state: "pending" });
  assert.deepEqual(pending.items.map((item) => item.id), [reviewId(1)]);
  assert.equal(pending.totals.all, 28);
  const accepted = await reviewFixtureData({ ...all, state: "accepted" });
  assert.deepEqual(accepted.items.map((item) => item.id), [reviewId(3), reviewId(6)]);
  const filtered = await reviewFixtureData({ ...all, q: "ANTIKYTHERA", project: reviewId(90) });
  assert.equal(filtered.totals.all, 1);
  assert.equal(filtered.items[0].id, reviewId(1));
  assert.equal((await reviewFixtureData({ ...all, q: "missing title" })).items.length, 0);
  assert.equal((await reviewFixtureData({ ...all, project: reviewId(99) })).totals.all, 0);
  const page2 = await reviewFixtureData({ ...all, page: 2 });
  assert.deepEqual(page2.items.map((item) => item.id), Array.from({ length: 8 }, (_,i) => reviewId(i + 21)));
  const beyond = await reviewFixtureData({ ...all, page: 50 });
  assert.equal(beyond.items.length, 0);
  assert.equal(beyond.totals.all, 28);
});

test("bounded reads use two set queries per source batch, no per-item lookups or partial failure data", async () => {
  const { client, calls } = reviewFixtureClient(205);
  const data = await readReviewQueue(client, reviewOwner, { ...all, page: 11 });
  assert.equal(data.items.length, 5);
  assert.equal(data.totals.all, 205);
  assert.equal(calls.filter((call) => call.sql === reviewContextsSql).length, 3);
  assert.equal(calls.filter((call) => call.sql === currentSuggestionsSql).length, 3);
  assert.ok(calls.filter((call) => call.sql === currentSuggestionsSql).every((call) => (call.values[1] as string[]).length <= 100));
  assert.equal(calls[0].sql, "set transaction isolation level repeatable read, read only");
  assert.equal(calls.some((call) => /insert |update |delete |for update/i.test(call.sql)), false);
  await assert.rejects(readReviewQueue(reviewFixtureClient(28, true).client, reviewOwner, all));
  await assert.rejects(readReviewQueue(client, "invalid", all), /Invalid owner/);
  const escaped = reviewFixtureClient();
  await readReviewQueue(escaped.client, reviewOwner, { ...all, q: "50%_\\" });
  assert.equal(escaped.calls.find((call) => call.sql === reviewContextsSql)?.values[2], "%50\\%\\_\\\\%");
});

test("queue route authenticates before loading records and has no write or inference entry point", () => {
  const page = readFileSync("src/app/review/page.tsx", "utf8");
  assert.ok(page.indexOf("if (!owner)") < page.indexOf("getReviewQueue(owner.id"));
  assert.match(page, /force-dynamic/);
  const source = [page, readFileSync("src/lib/clipforge/review-queue-read.ts", "utf8"), readFileSync("src/lib/clipforge/review-queue-store.ts", "utf8"), readFileSync("src/components/review-queue.tsx", "utf8")].join("\n");
  assert.doesNotMatch(source, /aiProvider|classifyContentItem|reviewContentSuggestion|method="post"|\/api\//);
  assert.match(source, /method="get"/);
  assert.match(readFileSync("src/lib/clipforge/classification-store.ts", "utf8"), /query<SuggestionRow>\(currentSuggestionsSql/);
});
