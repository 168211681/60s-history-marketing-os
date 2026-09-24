import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { validateDryRunOutput, validatePhase7MigrationSet } from "../scripts/ci/assert-staging-phase7-plan.mjs";

const workflow = readFileSync(new URL("../.github/workflows/apply-staging-phase7-research.yml", import.meta.url), "utf8");
const expected = "20260924041349";
const local = [
  "20260918173953", "20260918221342", "20260919151845", "20260919155933",
  "20260919162451", "20260919170000", "20260919183000", "20260919193000",
  "20260919200000", "20260919210000", "20260920000000", "20260920000001",
  "20260921130000", "20260923223010", "20260923231944", expected,
];
const remote = local.slice(0, -1).join("\n");

test("Phase 7 rehearsal is manual, staging-only and serialized", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|\n\s+push:/);
  assert.match(workflow, /if: github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /runs-on: \[self-hosted, linux, x64, history-ci\]/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /group: staging-db-mutation/);
  assert.match(workflow, /STAGING_PROJECT_REF: haqpqifxlqpihkmhkwdu/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF: rscwajzsjvguezyisvja/);
  assert.match(workflow, /EXPECTED_MIGRATION_VERSION: "20260924041349"/);
  assert.match(workflow, /SUPABASE_STAGING_DATABASE_URL/);
  assert.match(workflow, /SUPABASE_STAGING_ACCESS_TOKEN/);
  assert.doesNotMatch(workflow, /apply_migration|migration repair|db reset|db seed|pull_request_target/);
  assert.match(workflow, /phase7-source/);
  assert.match(workflow, /PHASE7_SOURCE_SHA: 0694991c82e150e4a4ea47fdf7eb9ab1aba61ed8/);
  assert.match(workflow, /fe04ca2a96e65394beabb1dcf46146f805d6b7d7a886a3ed77c3c019b79621ec/);
  assert.match(workflow, /main_dir="\$GITHUB_WORKSPACE\/supabase\/migrations"/);
  assert.match(workflow, /test "\$\(find "\$main_dir" -maxdepth 1 -type f -name '\*\.sql' \| wc -l\)" = "15"/);
  assert.match(workflow, /cp "\$main_dir"\/\*\.sql "\$work\/supabase\/migrations\/"/);
  assert.match(workflow, /cp "\$source_file" "\$work\/supabase\/migrations\/"/);
  assert.match(workflow, /project_id = "phase7-staging-rehearsal"/);
  assert.match(workflow, /test "\$\(wc -l < "\$RUNNER_TEMP\/local-migration-versions\.txt"\)" = "16"/);
});

test("migration gate accepts only 15 Staging versions plus the pinned Phase 7 version", () => {
  const result = validatePhase7MigrationSet(local.join("\n"), remote, expected);
  assert.deepEqual(result.missing, [expected]);
  assert.equal(result.local.length, 16);
  assert.equal(result.remote.length, 15);
  assert.throws(() => validatePhase7MigrationSet(local.join("\n") + "\n20260924050000", remote, expected), /Unexpected migration counts/);
  assert.throws(() => validatePhase7MigrationSet(local.join("\n"), remote.replace("20260923223010", "20260923222999"), expected), /Unexpected migration set difference/);
  assert.throws(() => validatePhase7MigrationSet(local.join("\n"), `${remote}\n${expected}`, expected), /Unexpected migration counts/);
  assert.throws(() => validatePhase7MigrationSet(local.join("\n"), `${remote}\n20260924100000`, expected), /Unexpected migration counts/);
  assert.doesNotThrow(() => validateDryRunOutput("Applying migration 20260924041349_research_fact_checking.sql", expected));
  assert.throws(() => validateDryRunOutput("Remote database is up to date", expected), /up to date/);
  assert.throws(() => validateDryRunOutput("20260924041349 and 20260924100000", expected), /multiple migration versions/);
});

test("Phase 7 workflow uses the phase-specific 16/15 set validator, not reconciliation's 15/14 validator", () => {
  assert.match(workflow, /assert-staging-phase7-plan\.mjs --migration-set/);
  assert.match(workflow, /assert-staging-phase7-plan\.mjs --dry-run/);
  assert.doesNotMatch(workflow, /assert-staging-reconciliation-plan\.mjs/);
});

test("main baseline stays at 15 migrations and Phase 7 source stays pinned when present", () => {
  const migrationPath = new URL("../supabase/migrations/20260924041349_research_fact_checking.sql", import.meta.url);
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const migrationCount = readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).length;
  assert.ok(migrationCount === 15 || migrationCount === 16, `Unexpected migration count: ${migrationCount}`);
  if (migrationCount === 15) {
    assert.equal(existsSync(migrationPath), false);
    return;
  }
  assert.equal(existsSync(migrationPath), true);
  const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
  assert.equal(digest, "fe04ca2a96e65394beabb1dcf46146f805d6b7d7a886a3ed77c3c019b79621ec");
});
