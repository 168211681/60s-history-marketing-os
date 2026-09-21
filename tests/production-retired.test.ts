import assert from "node:assert/strict";
import test from "node:test";
import { POST as startWorkflow } from "../src/app/api/scripts/[id]/workflow/route";
import { POST as runWorker } from "../src/app/api/workflows/run/route";
import { POST as publishWorkflow } from "../src/app/api/workflows/[id]/publish/route";
import { GET as productionCron } from "../src/app/api/cron/production-workflow/route";

test("retired production endpoints cannot create or publish jobs", async () => {
  for (const response of [await startWorkflow(), await runWorker(), await publishWorkflow(), await productionCron()]) {
    assert.equal(response.status, 410);
    assert.match(await response.text(), /PRODUCTION_RETIRED/);
  }
});
