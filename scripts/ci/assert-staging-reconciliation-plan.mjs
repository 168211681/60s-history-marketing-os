import { readFile } from "node:fs/promises";

const [outputPath, expectedVersion] = process.argv.slice(2);
if (!outputPath || !expectedVersion) {
  throw new Error("Usage: assert-staging-reconciliation-plan.mjs <dry-run-output> <expected-version>");
}

const output = await readFile(outputPath, "utf8");
const migrationNames = [...output.matchAll(/\b(\d{14})_[A-Za-z0-9_]+\.sql\b/g)].map((match) => match[0]);
const versions = [...new Set(migrationNames.map((name) => name.slice(0, 14)))];

if (versions.length !== 1 || versions[0] !== expectedVersion || !migrationNames.includes(`${expectedVersion}_reconcile_content_experiments_schema.sql`)) {
  throw new Error("Dry-run did not contain exactly the expected Staging reconciliation migration.");
}

console.log(`Dry-run contains only ${expectedVersion}_reconcile_content_experiments_schema.sql.`);
