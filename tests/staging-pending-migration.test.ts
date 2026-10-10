import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readLocalMigrationVersions, validatePendingMigrationSet } from "../scripts/ci/assert-staging-pending-migration.mjs";

const older = ["20260918173953", "20260924041349", "20260928140124"];
const pending = "20261006175601";
const local = [...older, pending];

test("accepts one pending migration without hardcoding counts", () => {
  const result = validatePendingMigrationSet(local.join("\n"), older.join("\n"), pending);
  assert.deepEqual(result.pending, [pending]);
  assert.equal(result.remote.length, 3);
  assert.equal(result.local.length, 4);
  const small = validatePendingMigrationSet("20260928140124\n20261006175601\n", "20260928140124\n", pending);
  assert.deepEqual(small.pending, [pending]);
  assert.equal(small.local.length, 2);
});

test("fails when Staging has an unknown migration", () => {
  assert.throws(
    () => validatePendingMigrationSet(local.join("\n"), [...older, "20260929000000"].join("\n"), pending),
    /missing from the repository: 20260929000000/,
  );
});

test("fails when two local migrations are pending", () => {
  assert.throws(
    () => validatePendingMigrationSet([...local, "20261007000000"].join("\n"), older.join("\n"), pending),
    /found 20261006175601,20261007000000/,
  );
});

test("fails when the expected migration is already applied on Staging", () => {
  assert.throws(
    () => validatePendingMigrationSet(local.join("\n"), local.join("\n"), pending),
    /already applied on Staging/,
  );
});

test("fails when the pending version differs", () => {
  assert.throws(
    () => validatePendingMigrationSet(local.join("\n"), older.join("\n"), "20261007000000"),
    /must be exactly 20261007000000; found 20261006175601/,
  );
});

test("fails on a duplicate or malformed version", () => {
  assert.throws(
    () => validatePendingMigrationSet(`${local.join("\n")}\n${pending}\n`, older.join("\n"), pending),
    /Local migration versions contain a duplicate/,
  );
  assert.throws(
    () => validatePendingMigrationSet(`${older.join("\n")}\n2026092814012\n${pending}\n`, older.join("\n"), pending),
    /Local migration versions contain an invalid value/,
  );
  assert.throws(
    () => validatePendingMigrationSet(local.join("\n"), `${older.join("\n")}\nnot-a-version\n`, pending),
    /Remote migration versions contain an invalid value/,
  );
});

test("fails when Staging is missing an older historical migration", () => {
  const remote = older.filter((version) => version !== "20260928140124");
  assert.throws(
    () => validatePendingMigrationSet(local.join("\n"), remote.join("\n"), pending),
    /found 20260928140124,20261006175601/,
  );
});

test("fails when the repository is missing a migration Staging has", () => {
  const repository = local.filter((version) => version !== "20260928140124");
  assert.throws(
    () => validatePendingMigrationSet(repository.join("\n"), older.join("\n"), pending),
    /missing from the repository: 20260928140124/,
  );
});

test("reads only valid local migration filenames", async () => {
  const root = await mkdtemp(join(tmpdir(), "pending-migrations-"));
  const migrations = join(root, "migrations");
  await mkdir(migrations);
  for (const version of local) await writeFile(join(migrations, `${version}_example.sql`), "-- test\n");
  const versions = await readLocalMigrationVersions(migrations);
  assert.deepEqual(versions, local);
  await writeFile(join(migrations, "notes.sql"), "");
  await assert.rejects(readLocalMigrationVersions(migrations), /filename is invalid: notes.sql/);
  await rm(root, { recursive: true, force: true });
});

test("this branch includes the password and ClipForge migrations", async () => {
  const versions = await readLocalMigrationVersions("supabase/migrations");
  assert.equal(versions.length, 23);
  assert.ok(versions.includes("20261009180957"));
  assert.ok(versions.includes("20260928140124"));
  assert.ok(versions.includes("20261006175601"));
  assert.ok(versions.includes("20261006210730"));
});

test("staging validation requires exact migration equality and stays read-only", async () => {
  const workflow = await readFile(".github/workflows/validate-staging-db.yml", "utf8");
  assert.match(workflow, /assert-staging-migration-versions\.mjs/);
  assert.doesNotMatch(workflow, /EXPECTED_PENDING_MIGRATION/);
  assert.doesNotMatch(workflow, /assert-staging-pending-migration\.mjs/);
  assert.match(workflow, /select version from supabase_migrations\.schema_migrations order by version/);
  assert.match(workflow, /assert-staging-database-url\.mjs/);
  assert.match(workflow, /assert-staging-project-identity\.mjs/);
  assert.match(workflow, /--request GET/);
  assert.match(workflow, /https:\/\/api\.supabase\.com\/v1\/projects\/\$\{STAGING_PROJECT_REF\}/);
  assert.doesNotMatch(workflow, /projects list/);
  assert.doesNotMatch(workflow, /echo\s+.*SUPABASE_ACCESS_TOKEN/);
  assert.match(workflow, /npm run test:db/);
  assert.match(workflow, /scripts\/db\/verify-retirement\.sql/);
  assert.doesNotMatch(workflow, /db push|migration repair|db reset|db seed|apply_migration|migration up/);
});
