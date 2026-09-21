import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("retirement verification uses the pg_policies catalog column and stays read-only", async () => {
  const sql = await readFile(resolve(repositoryRoot, "scripts/db/verify-retirement.sql"), "utf8");

  assert.match(sql, /select\s+tablename,\s+policyname,\s+roles,\s+cmd\s+from\s+pg_policies/i);
  assert.doesNotMatch(sql, /select\s+table_name,\s+policyname,\s+roles,\s+cmd\s+from\s+pg_policies/i);
  assert.doesNotMatch(sql, /^\s*(insert|update|delete|drop|alter|truncate)\b/im);
  assert.match(sql, /production_workflows/);
  assert.match(sql, /video_generation_jobs/);
  assert.match(sql, /script_drafts/);
  assert.match(sql, /channel_metrics/);
});
