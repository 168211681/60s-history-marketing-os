import assert from "node:assert/strict";
import test from "node:test";
import { validateDryRunOutput, validateMigrationSet } from "../scripts/ci/assert-staging-reconciliation-plan.mjs";

const expected = "20260923231944";
const baseVersions = Array.from({ length: 14 }, (_, index) => String(20260920000000 + index).padStart(14, "0"));
const local = [...baseVersions, expected].sort().join("\n");
const remote = baseVersions.join("\n");

test("migration set requires exactly one pending reconciliation version", () => {
  assert.deepEqual(validateMigrationSet(local, remote, expected).missing, [expected]);
  assert.throws(() => validateMigrationSet(local, `${remote}\n${expected}`, expected), /counts/);
  assert.throws(() => validateMigrationSet(`${local}\n20260923231945`, remote, expected), /counts/);
  assert.throws(() => validateMigrationSet(local, `${remote}\n20260923231945`, expected), /counts/);
});

test("dry-run parser accepts CLI presentation variants", () => {
  validateDryRunOutput("Applying migration 20260923231944_reconcile_content_experiments_schema.sql\n", expected);
  validateDryRunOutput("Applying migration 20260923231944 reconcile_content_experiments_schema\n", expected);
  validateDryRunOutput("Connecting to remote database...\nApplying migrations...\n", expected);
});

test("dry-run parser rejects unsafe or incomplete plans", () => {
  assert.throws(() => validateDryRunOutput("Remote database is up to date.\n", expected), /up to date/);
  assert.throws(() => validateDryRunOutput("Applying 20260923231944\nApplying 20260923231945\n", expected), /multiple/);
  assert.throws(() => validateDryRunOutput("Applying migration 20260923223010\n", expected), /unexpected/);
  assert.throws(() => validateDryRunOutput("", expected), /no output/);
});
