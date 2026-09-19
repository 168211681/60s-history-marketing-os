import test from "node:test";
import assert from "node:assert/strict";
import { buildMarketingInsights } from "../src/lib/insights";
import { sampleVideos } from "../src/lib/sample-data";

test("marketing insights separate observed comparisons from hypotheses", () => {
  const insights = buildMarketingInsights(sampleVideos);
  assert.deepEqual(insights.map((insight) => insight.kind), ["observation", "comparison", "hypothesis", "experiment"]);
  assert.match(insights[0].detail, /videos average/);
  assert.match(insights[2].detail, /not a causal conclusion/);
});

test("insights return an honest incomplete-data state", () => {
  const insights = buildMarketingInsights([sampleVideos[0]]);
  assert.equal(insights[0].kind, "observation");
  assert.match(insights[0].title, /not enough grouped data/);
  assert.equal(insights[1].kind, "hypothesis");
});
