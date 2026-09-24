import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_PATTERN = /\b(\d{14})\b/g;

function parseVersions(contents, label) {
  const versions = contents.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (versions.some((version) => !/^\d{14}$/.test(version))) {
    throw new Error(`${label} migration versions contain an invalid value.`);
  }
  const unique = [...new Set(versions)].sort();
  if (unique.length !== versions.length) {
    throw new Error(`${label} migration versions contain a duplicate.`);
  }
  return unique;
}

export function validateMigrationSet(localContents, remoteContents, expectedVersion) {
  if (!/^\d{14}$/.test(expectedVersion)) throw new Error("Expected migration version is invalid.");
  const local = parseVersions(localContents, "Local");
  const remote = parseVersions(remoteContents, "Remote");
  if (local.length !== 15 || remote.length !== 14) {
    throw new Error(`Unexpected migration counts: local=${local.length}, remote=${remote.length}.`);
  }
  const remoteSet = new Set(remote);
  const missing = local.filter((version) => !remoteSet.has(version));
  if (missing.length !== 1 || missing[0] !== expectedVersion) {
    throw new Error(`Unexpected local-minus-remote migration set: ${missing.join(", ") || "none"}.`);
  }
  if (remote.includes(expectedVersion)) throw new Error("Expected reconciliation migration is already applied remotely.");
  const localWithoutExpected = local.filter((version) => version !== expectedVersion);
  if (localWithoutExpected.join(",") !== remote.join(",")) {
    throw new Error("Remote migration history does not match the local history before reconciliation.");
  }
  return { local, remote, missing };
}

export function validateDryRunOutput(output, expectedVersion) {
  if (!output.trim()) throw new Error("Supabase dry-run returned no output.");
  if (/remote database is up to date/i.test(output)) {
    throw new Error("Supabase dry-run reported that the remote database is up to date.");
  }
  const versions = [...new Set([...output.matchAll(VERSION_PATTERN)].map((match) => match[1]))];
  if (versions.length > 1) throw new Error(`Supabase dry-run references multiple migration versions: ${versions.join(", ")}.`);
  if (versions.length === 1 && versions[0] !== expectedVersion) {
    throw new Error(`Supabase dry-run references unexpected migration version ${versions[0]}.`);
  }
  if (versions.length === 0) console.log("Dry-run output exposed no migration version; the migration set check is authoritative.");
  else console.log(`Dry-run references the expected migration version ${expectedVersion}.`);
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
const [mode, firstPath, secondPath, thirdPath] = isDirectExecution ? process.argv.slice(2) : [];
if (isDirectExecution) {
  const main = async () => {
    if (mode === "--migration-set") {
      if (!firstPath || !secondPath || !thirdPath) {
        throw new Error("Usage: assert-staging-reconciliation-plan.mjs --migration-set <expected-version> <local-versions> <remote-versions>");
      }
      const [localContents, remoteContents] = await Promise.all([readFile(secondPath, "utf8"), readFile(thirdPath, "utf8")]);
      const result = validateMigrationSet(localContents, remoteContents, firstPath);
      console.log(`Migration set verified: ${result.remote.length} remote versions and one pending ${firstPath}.`);
    } else if (mode === "--dry-run") {
      if (!firstPath || !secondPath) throw new Error("Usage: assert-staging-reconciliation-plan.mjs --dry-run <dry-run-output> <expected-version>");
      validateDryRunOutput(await readFile(firstPath, "utf8"), secondPath);
    } else {
      throw new Error("Usage: assert-staging-reconciliation-plan.mjs --migration-set|--dry-run ...");
    }
  };
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
