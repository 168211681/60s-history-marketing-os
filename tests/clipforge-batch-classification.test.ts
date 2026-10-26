import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BATCH_PER_RUN_LIMIT_MESSAGE,
  assembleBatchPreview,
  batchFailureMessage,
  claimBatchRun,
  failureDecision,
  generationQueue,
  parseBatchIds,
  planBatchItem,
  releaseBatchRun,
  runBatchClassification,
  toggleBatchSelection,
  type BatchFoundItem,
  type BatchSuggestionStatus,
} from "../src/lib/clipforge/batch-classification";
import { reviewClassification } from "../src/lib/clipforge/classification";

const itemId = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function found(value: number, title: string, status: BatchSuggestionStatus | null, stale = false): BatchFoundItem {
  return {
    id: itemId(value),
    title,
    projectId: itemId(90),
    projectName: "History in 60s",
    hasSuggestion: status !== null,
    status,
    stale,
  };
}

test("batch selection allows 0, 1, and 5 items and rejects more than 5", () => {
  assert.equal(parseBatchIds({ ids: [] }).ok, false);
  assert.equal(parseBatchIds({ ids: [itemId(1)] }).ok, true);
  assert.equal(parseBatchIds({ ids: [1, 2, 3, 4, 5].map(itemId) }).ok, true);
  const tooMany = parseBatchIds({ ids: [1, 2, 3, 4, 5, 6].map(itemId) });
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.equal(tooMany.error, BATCH_PER_RUN_LIMIT_MESSAGE);
  assert.match(BATCH_PER_RUN_LIMIT_MESSAGE, /per run/);
  assert.match(BATCH_PER_RUN_LIMIT_MESSAGE, /not a daily quota/);

  let selected: string[] = [];
  for (const value of [1, 2, 3, 4, 5]) {
    const next = toggleBatchSelection(selected, itemId(value));
    assert.equal(next.rejected, false);
    selected = next.selected;
  }
  assert.equal(selected.length, 5);
  const sixth = toggleBatchSelection(selected, itemId(6));
  assert.equal(sixth.rejected, true);
  assert.deepEqual(sixth.selected, selected);
  const cleared = toggleBatchSelection(selected, itemId(1));
  assert.deepEqual(cleared.selected, selected.slice(1));
});

test("a batch preview rejects another owner's item without returning owned titles", () => {
  const owned = found(1, "Owned private title", null);
  const result = assembleBatchPreview([itemId(1), itemId(2)], new Map([[owned.id, owned]]));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 404);
    assert.equal(result.error.includes(owned.title), false);
    assert.equal(result.error.includes(owned.projectName), false);
  }
  assert.equal(parseBatchIds({ ids: [itemId(1), itemId(1)] }).ok, false);
  assert.equal(parseBatchIds({ ids: ["not-a-uuid"] }).ok, false);
});

test("current suggestions are skipped and stale items stay a separate decision", () => {
  const records = [
    found(1, "New clip", null),
    found(2, "Pending clip", "pending", false),
    found(3, "Accepted clip", "accepted", true),
    found(4, "Rejected clip", "rejected", false),
    found(5, "Stale clip", "pending", true),
  ];
  const preview = assembleBatchPreview(records.map((record) => record.id), new Map(records.map((record) => [record.id, record])));
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.deepEqual(preview.preview.items.map((item) => item.state), ["Not generated", "Pending review", "Accepted", "Rejected", "Stale"]);
  assert.deepEqual(preview.preview.items.map((item) => item.action), ["generate", "skip", "skip", "skip", "decide"]);
  assert.equal(preview.preview.newRequestCount, 1);
  assert.equal(preview.preview.skippedCount, 3);
  assert.equal(preview.preview.separateDecisionCount, 1);
  assert.equal(preview.preview.limitKind, "per-run");
  assert.deepEqual(generationQueue(preview.preview.items).map((item) => item.id), [itemId(1)]);
  assert.equal(planBatchItem({ hasSuggestion: true, status: "superseded", stale: false }).action, "skip");
  assert.equal(planBatchItem({ hasSuggestion: true, status: "accepted", stale: true }).countsAsNewRequest, false);
  const staleReview = reviewClassification({
    action: "accept",
    fields: ["topic"],
    status: "pending",
    stale: true,
    suggestedTopic: "Siege engineering",
    suggestedContentPillar: null,
    suggestedProductionType: "unknown",
  });
  assert.equal(staleReview.ok, false);
});

test("duplicate clicks and failed requests do not repeat or damage the rest of the batch", async () => {
  const gate = { current: false };
  assert.equal(claimBatchRun(gate), true);
  assert.equal(claimBatchRun(gate), false);
  releaseBatchRun(gate);
  assert.equal(claimBatchRun(gate), true);

  const calls: string[] = [];
  const queue = [1, 2, 3].map((value) => ({ id: itemId(value), title: `Clip ${value}` }));
  const results = await runBatchClassification({
    queue,
    shouldContinue: () => true,
    classify: async (id) => {
      calls.push(id);
      if (id === itemId(2)) return { ok: false, status: 502, error: "AI_INVALID_RESPONSE" };
      return { ok: true };
    },
  });
  assert.deepEqual(calls, queue.map((item) => item.id));
  assert.deepEqual(results.map((item) => item.outcome), ["success", "failed", "success"]);
  assert.match(results[1].detail, /not retried/i);
  assert.equal(failureDecision(502), "continue");
  assert.equal(failureDecision(409), "continue");
  assert.match(batchFailureMessage(409, "CLASSIFICATION_INPUT_CHANGED"), /not retried/i);

  const rateCalls: string[] = [];
  const stopped = await runBatchClassification({
    queue,
    shouldContinue: () => true,
    classify: async (id) => {
      rateCalls.push(id);
      return { ok: false, status: 429, error: null };
    },
  });
  assert.deepEqual(rateCalls, [itemId(1)]);
  assert.deepEqual(stopped.map((item) => item.outcome), ["failed", "not_started", "not_started"]);
  assert.equal(failureDecision(503), "stop");
});

test("closing the page stops new requests and a later preview does not classify stored items again", async () => {
  const queue = [1, 2].map((value) => ({ id: itemId(value), title: `Clip ${value}` }));
  let continueRun = true;
  const calls: string[] = [];
  const first = await runBatchClassification({
    queue,
    shouldContinue: () => continueRun,
    classify: async (id) => {
      calls.push(id);
      continueRun = false;
      return { ok: true };
    },
  });
  assert.deepEqual(calls, [itemId(1)]);
  assert.deepEqual(first.map((item) => item.outcome), ["success", "not_started"]);

  const resumed = assembleBatchPreview(
    [itemId(1), itemId(2)],
    new Map([
      [itemId(1), found(1, "Clip 1", "pending", false)],
      [itemId(2), found(2, "Clip 2", null)],
    ]),
  );
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.deepEqual(generationQueue(resumed.preview.items).map((item) => item.id), [itemId(2)]);
});

test("batch classification does not write canonical metadata or add a bulk accept", () => {
  const files = [
    "src/lib/clipforge/batch-classification.ts",
    "src/components/batch-classification.tsx",
    "src/app/api/content-items/classification-batch/preview/route.ts",
    "src/app/library/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // The Library may link to the read-only /review queue; batch code still
    // must never call an individual review action or expose bulk acceptance.
    assert.doesNotMatch(source, /reviewContentSuggestion|\/api\/content-items\/[^\s]+\/review|update public\.content_items|Accept selected|USD|\$\d/);
    if (file !== "src/app/library/page.tsx") assert.doesNotMatch(source, /\/review/);
  }
  const panel = readFileSync("src/components/batch-classification.tsx", "utf8");
  assert.match(panel, /pagehide/);
  assert.match(panel, /claimBatchRun/);
  assert.match(panel, /\/api\/content-items\/\$\{id\}\/classify/);
  assert.doesNotMatch(panel, /Promise\.all/);
  const runner = readFileSync("src/lib/clipforge/batch-classification.ts", "utf8");
  const run = runner.slice(runner.indexOf("export async function runBatchClassification"), runner.length);
  assert.match(run, /for \(let index = 0/);
  assert.doesNotMatch(run, /Promise\.all/);
  assert.match(run, /await input\.classify\(item\.id\)/);
  const store = readFileSync("src/lib/clipforge/classification-store.ts", "utf8");
  const preview = store.slice(store.indexOf("export async function previewBatchClassification"), store.indexOf("export async function reviewContentSuggestion"));
  assert.match(preview, /owner_id = \$1/);
  assert.match(preview, /p\.owner_id = i\.owner_id/);
  assert.doesNotMatch(preview, /for update|update public\.content_items|insert into public\.content_classification_suggestions/);
  const route = readFileSync("src/app/api/content-items/classification-batch/preview/route.ts", "utf8");
  assert.match(route, /currentOwner/);
  assert.match(route, /request\.headers\.get\("origin"\)/);
  assert.match(route, /previewBatchClassification/);
  const classify = readFileSync("src/app/api/content-items/[id]/classify/route.ts", "utf8");
  assert.match(classify, /classifyContentItem/);
  assert.doesNotMatch(classify, /reviewContentSuggestion|update public\.content_items/);
  assert.doesNotMatch(readFileSync("src/lib/clipforge/classification.ts", "utf8"), /batch classification prompt/i);
});
