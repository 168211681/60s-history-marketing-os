import { readdir, readFile } from "node:fs/promises";

export async function compareStagingMigrationVersions(versionsPath, migrationsPath) {
  const local = (await readdir(migrationsPath))
    .map((name) => name.match(/^(\d{14})_[A-Za-z0-9_]+\.sql$/)?.[1])
    .filter(Boolean)
    .sort();
  const remote = (await readFile(versionsPath, "utf8"))
    .split(/\r?\n/)
    .map((version) => version.trim())
    .filter(Boolean);
  if (remote.some((version) => !/^\d{14}$/.test(version))) {
    throw new Error("Staging migration query returned an invalid version.");
  }
  if (remote.length !== local.length || remote.some((version, index) => version !== local[index])) {
    throw new Error("Staging migration versions do not exactly match local migrations.");
  }
  return local.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [versionsPath, migrationsPath] = process.argv.slice(2);
  if (!versionsPath || !migrationsPath) throw new Error("Usage: assert-staging-migration-versions.mjs <versions> <migrations-dir>");
  compareStagingMigrationVersions(versionsPath, migrationsPath)
    .then((count) => console.log(`Staging migration history matches ${count} local migrations.`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
