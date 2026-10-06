import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EXPECTED_STAGING_PROJECT_NAME,
  EXPECTED_STAGING_PROJECT_REF,
  parseStagingProjectResponse,
  validateStagingProject,
} from "../scripts/ci/assert-staging-project-identity.mjs";

const productionRef = "rscwajzsjvguezyisvja";

const stagingProject = {
  id: EXPECTED_STAGING_PROJECT_REF,
  ref: EXPECTED_STAGING_PROJECT_REF,
  name: EXPECTED_STAGING_PROJECT_NAME,
};

test("accepts the single Staging project object", () => {
  assert.deepEqual(validateStagingProject(stagingProject), {
    id: EXPECTED_STAGING_PROJECT_REF,
    ref: EXPECTED_STAGING_PROJECT_REF,
    name: EXPECTED_STAGING_PROJECT_NAME,
  });
  assert.deepEqual(validateStagingProject({ id: EXPECTED_STAGING_PROJECT_REF }), {
    id: EXPECTED_STAGING_PROJECT_REF,
    ref: EXPECTED_STAGING_PROJECT_REF,
    name: null,
  });
  assert.deepEqual(validateStagingProject({ ref: EXPECTED_STAGING_PROJECT_REF, name: null }), {
    id: EXPECTED_STAGING_PROJECT_REF,
    ref: EXPECTED_STAGING_PROJECT_REF,
    name: null,
  });
});

test("rejects the Production project, a wrong name, and an unrelated project", () => {
  assert.throws(
    () => validateStagingProject({ ...stagingProject, id: productionRef, ref: productionRef }),
    /does not match the expected Staging project/,
  );
  assert.throws(
    () => validateStagingProject({ ...stagingProject, name: "60s-history-production" }),
    /name does not match/,
  );
  assert.throws(
    () => validateStagingProject({ id: "unrelatedprojectrefx", ref: "unrelatedprojectrefx", name: EXPECTED_STAGING_PROJECT_NAME }),
    /does not match the expected Staging project/,
  );
  assert.throws(
    () => validateStagingProject({ id: EXPECTED_STAGING_PROJECT_REF, ref: productionRef }),
    /ref does not match/,
  );
});

test("rejects malformed JSON, a project list, and a response missing id and ref", () => {
  assert.throws(() => parseStagingProjectResponse("{"), /not valid JSON/);
  assert.throws(() => parseStagingProjectResponse("not-json"), /not valid JSON/);
  assert.throws(
    () => validateStagingProject([stagingProject]),
    /not a project list/,
  );
  assert.throws(() => validateStagingProject([]), /not a project list/);
  assert.throws(() => validateStagingProject({ name: EXPECTED_STAGING_PROJECT_NAME }), /missing id and ref/);
  assert.throws(() => validateStagingProject({ id: "", ref: "" }), /missing id and ref/);
  assert.throws(() => validateStagingProject(null), /JSON object/);
});

test("staging validation reads one project and stays read-only", async () => {
  const workflow = await readFile(".github/workflows/validate-staging-db.yml", "utf8");
  assert.doesNotMatch(workflow, /projects list/);
  assert.doesNotMatch(workflow, /npx --yes supabase/);
  assert.match(workflow, /--request GET/);
  assert.match(workflow, /https:\/\/api\.supabase\.com\/v1\/projects\/\$\{STAGING_PROJECT_REF\}/);
  assert.equal(workflow.match(/api\.supabase\.com/g)?.length, 1);
  assert.match(workflow, /assert-staging-project-identity\.mjs/);
  assert.match(workflow, /assert-staging-database-url\.mjs/);
  assert.match(workflow, /assert-staging-pending-migration\.mjs/);
  assert.match(workflow, /EXPECTED_PENDING_MIGRATION: "20261006175601"/);
  assert.doesNotMatch(workflow, /echo\s+.*SUPABASE_ACCESS_TOKEN/);
  assert.doesNotMatch(workflow, /echo\s+.*Authorization/);
  assert.doesNotMatch(workflow, /--verbose/);
  assert.doesNotMatch(workflow, /db push|migration repair|db reset|db seed|apply_migration|migration up/);
  assert.doesNotMatch(workflow, /--request\s+(POST|PUT|PATCH|DELETE)/);
  const databaseCheck = workflow.indexOf("assert-staging-database-url.mjs");
  const projectCheck = workflow.indexOf("assert-staging-project-identity.mjs");
  const pendingCheck = workflow.indexOf("assert-staging-pending-migration.mjs");
  assert.ok(databaseCheck > 0 && projectCheck > databaseCheck && pendingCheck > projectCheck);
});
