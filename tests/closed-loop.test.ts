import assert from "node:assert/strict";
import test from "node:test";
import {
  compareReportingWindows,
  containsCausalLanguage,
  evaluateExperiment,
  evidenceSufficiency,
  normalizeMetric,
  percentDifference,
} from "../src/lib/closed-loop";

const complete = { views: 100, averageViewDurationSeconds: 10, likes: 4, comments: 2 };

test("equivalent reporting windows compare by inclusive day count", () => {
  assert.deepEqual(compareReportingWindows({ from: "2026-09-01", through: "2026-09-01" }, { from: "2026-09-10", through: "2026-09-10" }), { comparable: true, days: 1 });
  assert.equal(compareReportingWindows({ from: "2026-09-01", through: "2026-09-02" }, { from: "2026-09-10", through: "2026-09-12" }).comparable, false);
});

test("invalid windows and metrics fail closed", () => {
  assert.equal(compareReportingWindows({ from: "2026-09-02", through: "2026-09-01" }, { from: "2026-09-01", through: "2026-09-01" }).comparable, false);
  assert.equal(normalizeMetric(null), null);
  assert.equal(normalizeMetric(-1), null);
  assert.equal(percentDifference(0, 4), null);
  assert.equal(percentDifference(null, 4), null);
});

test("percent difference is deterministic and null-safe", () => {
  assert.equal(percentDifference(100, 125), 25);
  assert.equal(percentDifference(100, 75), -25);
  assert.equal(evidenceSufficiency({ comparable: true, days: 1 }, complete, { ...complete, views: null }), "insufficient");
});

test("evaluation separates observations, comparisons, hypotheses and next test", () => {
  const result = evaluateExperiment({
    hypothesis: "Question-led hooks may hold attention.",
    nextTest: "Repeat with another comparable history topic.",
    baselineWindow: { from: "2026-09-01", through: "2026-09-01" },
    candidateWindow: { from: "2026-09-10", through: "2026-09-10" },
    baseline: complete,
    candidate: { ...complete, views: 125, averageViewDurationSeconds: 12 },
  });
  assert.equal(result.evidence, "sufficient");
  assert.match(result.comparison, /25\.0%/);
  assert.equal(containsCausalLanguage(`${result.observation} ${result.comparison} ${result.hypothesis} ${result.recommendation}`), false);
});

test("evaluation stays insufficient for unequal windows", () => {
  const result = evaluateExperiment({
    hypothesis: "Testable hypothesis.",
    nextTest: "Collect another equal window.",
    baselineWindow: { from: "2026-09-01", through: "2026-09-01" },
    candidateWindow: { from: "2026-09-10", through: "2026-09-17" },
    baseline: complete,
    candidate: complete,
  });
  assert.equal(result.evidence, "insufficient");
  assert.match(result.comparison, /same number of days/);
});
