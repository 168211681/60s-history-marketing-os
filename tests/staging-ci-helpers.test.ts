import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyDiagnostic, sanitizeDiagnostic } from "../scripts/ci/sanitize-cli-diagnostic.mjs";
import { compareStagingMigrationVersions } from "../scripts/ci/assert-staging-migration-versions.mjs";

test("sanitizes database diagnostics and classifies authentication errors", () => {
  const url = "postgresql://user:password@pooler.supabase.com:5432/postgres";
  const raw = `password authentication failed for ${url} access_token=jwt-value`;
  assert.equal(classifyDiagnostic(raw), "AUTHENTICATION");
  const safe = sanitizeDiagnostic(raw, url);
  assert.doesNotMatch(safe, /password@|jwt-value|postgresql:\/\/user/);
  assert.match(safe, /\[REDACTED_DATABASE_URL\]|\[REDACTED\]/);
});

test("compares the exact 14 read-only migration versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "staging-ci-"));
  const migrations = join(root, "migrations");
  await mkdir(migrations);
  const versions = [
    "20260918173953", "20260918221342", "20260919151845", "20260919155933",
    "20260919162451", "20260919170000", "20260919183000", "20260919193000",
    "20260919200000", "20260919210000", "20260920000000", "20260920000001",
    "20260921130000", "20260923223010",
  ];
  for (const version of versions) await writeFile(join(migrations, `${version}_test.sql`), "");
  const remote = join(root, "remote.txt");
  await writeFile(remote, `${versions.join("\n")}\n`);
  assert.equal(await compareStagingMigrationVersions(remote, migrations), 14);
  await rm(root, { recursive: true, force: true });
});
