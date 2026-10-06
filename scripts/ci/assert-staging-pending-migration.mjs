import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_PATTERN = /^\d{14}$/;
const FILENAME_PATTERN = /^(\d{14})_[A-Za-z0-9_]+\.sql$/;

export function parseVersionLines(contents, label) {
  const versions = String(contents).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (versions.some((version) => !VERSION_PATTERN.test(version))) {
    throw new Error(`${label} migration versions contain an invalid value.`);
  }
  if (new Set(versions).size !== versions.length) {
    throw new Error(`${label} migration versions contain a duplicate.`);
  }
  return [...versions].sort();
}

export async function readLocalMigrationVersions(migrationsPath) {
  const names = await readdir(migrationsPath);
  const versions = names.map((name) => {
    const match = FILENAME_PATTERN.exec(name);
    if (!match) throw new Error(`Local migration filename is invalid: ${name}`);
    return match[1];
  });
  if (new Set(versions).size !== versions.length) {
    throw new Error("Local migration versions contain a duplicate.");
  }
  return versions.sort();
}

export function validatePendingMigrationSet(localContents, remoteContents, expectedVersion) {
  if (!VERSION_PATTERN.test(expectedVersion)) {
    throw new Error("Expected pending migration version is invalid.");
  }
  const local = parseVersionLines(localContents, "Local");
  const remote = parseVersionLines(remoteContents, "Remote");
  const localSet = new Set(local);
  const remoteSet = new Set(remote);
  const remoteOnly = remote.filter((version) => !localSet.has(version));
  const localOnly = local.filter((version) => !remoteSet.has(version));
  if (remoteOnly.length !== 0) {
    throw new Error(`Remote Staging history contains versions missing from the repository: ${remoteOnly.join(",")}.`);
  }
  if (remoteSet.has(expectedVersion)) {
    throw new Error("Expected pending migration is already applied on Staging.");
  }
  if (localOnly.length !== 1 || localOnly[0] !== expectedVersion) {
    throw new Error(`Pending migration set must be exactly ${expectedVersion}; found ${localOnly.join(",") || "none"}.`);
  }
  return { local, remote, pending: localOnly };
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectExecution) {
  const [expectedVersion, remotePath, localPath] = process.argv.slice(2);
  if (!expectedVersion || !remotePath || !localPath) {
    console.error("Usage: assert-staging-pending-migration.mjs <expected-version> <remote-versions> <local-migrations-dir-or-versions>");
    process.exitCode = 1;
  } else {
    Promise.all([readFile(remotePath, "utf8"), stat(localPath)]).then(async ([remoteContents, localInfo]) => {
      const localContents = localInfo.isDirectory()
        ? (await readLocalMigrationVersions(localPath)).join("\n")
        : await readFile(localPath, "utf8");
      const result = validatePendingMigrationSet(localContents, remoteContents, expectedVersion);
      console.log(`Staging migration set verified: ${result.remote.length} remote versions and pending ${result.pending[0]}.`);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
