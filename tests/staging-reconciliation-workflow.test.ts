import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("staging reconciliation workflow is manual and isolated", async () => {
  const workflow = await readFile(".github/workflows/apply-staging-reconciliation.yml", "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(pull_request|push):/m);
  assert.match(workflow, /runs-on: \[self-hosted, linux, x64, history-ci\]/);
  assert.match(workflow, /STAGING_PROJECT_REF: haqpqifxlqpihkmhkwdu/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF: rscwajzsjvguezyisvja/);
  assert.match(workflow, /EXPECTED_MIGRATION_VERSION: ["']?20260923231944/);
  assert.match(workflow, /assert-staging-database-url\.mjs/);
  assert.match(workflow, /assert-staging-project\.mjs/);
  assert.match(workflow, /--dry-run --yes --skip-vault/);
  assert.match(workflow, /--yes --skip-vault/);
  assert.equal(workflow.match(/--field-separator=\$'\\t'/g)?.length, 2);
  assert.equal(workflow.match(/IFS=\$'\\t' read/g)?.length, 2);
  assert.doesNotMatch(workflow, /migration\s+repair|db\s+reset|db\s+seed|--include-seed|--include-all|--include-roles/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /echo\s+.*STAGING_DATABASE_URL|echo\s+.*SUPABASE_ACCESS_TOKEN/);
});
