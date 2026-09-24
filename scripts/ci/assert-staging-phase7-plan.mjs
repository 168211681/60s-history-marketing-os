import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDryRunOutput } from "./assert-staging-reconciliation-plan.mjs";

function parseVersions(contents, label) {
  const versions = contents.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (versions.some((version) => !/^\d{14}$/.test(version))) {
    throw new Error(`${label} migration versions contain an invalid value.`);
  }
  const unique = [...new Set(versions)].sort();
  if (unique.length !== versions.length) throw new Error(`${label} migration versions contain a duplicate.`);
  return unique;
}

export function validatePhase7MigrationSet(localContents, remoteContents, expectedVersion = "20260924041349") {
  if (expectedVersion !== "20260924041349") throw new Error("Unexpected Phase 7 migration version.");
  const local = parseVersions(localContents, "Local");
  const remote = parseVersions(remoteContents, "Remote");
  if (local.length !== 16 || remote.length !== 15) {
    throw new Error(`Unexpected migration counts: local=${local.length}, remote=${remote.length}.`);
  }
  if (remote.includes(expectedVersion)) throw new Error("Expected Phase 7 migration is already applied remotely.");
  const remoteSet = new Set(remote);
  const missing = local.filter((version) => !remoteSet.has(version));
  const unexpectedRemote = remote.filter((version) => !local.includes(version));
  if (missing.length !== 1 || missing[0] !== expectedVersion || unexpectedRemote.length !== 0) {
    throw new Error(`Unexpected migration set difference: local-only=${missing.join(",") || "none"}; remote-only=${unexpectedRemote.join(",") || "none"}.`);
  }
  return { local, remote, missing };
}

export { validateDryRunOutput };

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectExecution) {
  const main = async () => {
    const [mode, first, second, third] = process.argv.slice(2);
    if (mode === "--migration-set" && first && second && third) {
      const [local, remote] = await Promise.all([readFile(second, "utf8"), readFile(third, "utf8")]);
      const result = validatePhase7MigrationSet(local, remote, first);
      console.log(`Phase 7 migration set verified: ${result.remote.length} remote versions and one pending ${first}.`);
      return;
    }
    if (mode === "--dry-run" && first && second) {
      validateDryRunOutput(await readFile(first, "utf8"), second);
      return;
    }
    if (mode === "--help") {
      console.log("Usage: assert-staging-phase7-plan.mjs --migration-set <expected-version> <local-versions> <remote-versions> | --dry-run <output-file> <expected-version>");
      return;
    }
    throw new Error("Invalid arguments for Phase 7 migration plan validation.");
  };
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
