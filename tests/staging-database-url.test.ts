import assert from "node:assert/strict";
import test from "node:test";
import { validateStagingDatabaseUrl } from "../scripts/ci/assert-staging-database-url.mjs";

const refs = {
  stagingRef: "haqpqifxlqpihkmhkwdu",
  productionRef: "rscwajzsjvguezyisvja",
};

test("accepts the direct Staging database URL", () => {
  assert.equal(
    validateStagingDatabaseUrl(
      "postgresql://postgres:pw@db.haqpqifxlqpihkmhkwdu.supabase.co:5432/postgres",
      refs,
    ),
    "direct",
  );
});

test("accepts the Staging Session Pooler URL", () => {
  assert.equal(
    validateStagingDatabaseUrl(
      "postgresql://postgres.haqpqifxlqpihkmhkwdu:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres",
      refs,
    ),
    "session-pooler",
  );
});

test("rejects Production direct and pooler targets", () => {
  assert.throws(() =>
    validateStagingDatabaseUrl(
      "postgresql://postgres:pw@db.rscwajzsjvguezyisvja.supabase.co:5432/postgres",
      refs,
    ),
  );
  assert.throws(() =>
    validateStagingDatabaseUrl(
      "postgresql://postgres.rscwajzsjvguezyisvja:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres",
      refs,
    ),
  );
});

test("rejects wrong project, database and port", () => {
  assert.throws(() =>
    validateStagingDatabaseUrl(
      "postgresql://postgres:pw@db.other-project.supabase.co:5432/postgres",
      refs,
    ),
  );
  assert.throws(() =>
    validateStagingDatabaseUrl(
      "postgresql://postgres.haqpqifxlqpihkmhkwdu:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/other",
      refs,
    ),
  );
  assert.throws(() =>
    validateStagingDatabaseUrl(
      "postgresql://postgres.haqpqifxlqpihkmhkwdu:pw@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres",
      refs,
    ),
  );
});
