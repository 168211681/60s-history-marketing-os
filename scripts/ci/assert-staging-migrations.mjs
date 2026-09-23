import { readdir, readFile } from "node:fs/promises";

const [jsonPath, migrationsPath] = process.argv.slice(2);
if (!jsonPath || !migrationsPath) {
  throw new Error("Usage: assert-staging-migrations.mjs <remote-json> <migrations-dir>");
}

const local = (await readdir(migrationsPath))
  .map((name) => name.match(/^(\d{14})_[A-Za-z0-9_]+\.sql$/)?.[1])
  .filter(Boolean)
  .sort();
const payload = JSON.parse(await readFile(jsonPath, "utf8"));
const remoteVersions = new Set();

function collectRemote(value, remoteContext = false) {
  if (typeof value === "string") {
    if (remoteContext) {
      for (const version of value.match(/\b\d{14}\b/g) ?? []) remoteVersions.add(version);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRemote(item, remoteContext);
    return;
  }
  if (!value || typeof value !== "object") return;

  const entries = Object.entries(value);
  const isRemoteRow = entries.some(([key, entry]) =>
    /remote|applied/i.test(key) && (entry === true || /^\d{14}$/.test(String(entry))),
  );
  for (const [key, entry] of entries) {
    const keyIsRemote = /remote|applied/i.test(key);
    collectRemote(entry, remoteContext || keyIsRemote || isRemoteRow);
  }
}

collectRemote(payload);
const remote = [...remoteVersions].sort();
if (remote.length === 0) {
  throw new Error("Supabase CLI output did not expose a remote migration set; refusing to compare an ambiguous payload.");
}
if (remote.length !== local.length || remote.some((version, index) => version !== local[index])) {
  throw new Error("Staging migration versions do not exactly match local migrations.");
}
console.log(`Staging migration history matches ${local.length} local migrations.`);
