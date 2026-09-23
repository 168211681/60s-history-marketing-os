import { readFile } from "node:fs/promises";

const [jsonPath, stagingRef] = process.argv.slice(2);
if (!jsonPath || !stagingRef) {
  throw new Error("Usage: assert-staging-project.mjs <json> <staging-ref>");
}

const payload = JSON.parse(await readFile(jsonPath, "utf8"));
const refs = JSON.stringify(payload).match(/[a-z0-9]{20,}/g) ?? [];
if (!refs.includes(stagingRef)) {
  throw new Error("The expected Staging project reference was not returned by the Supabase API.");
}
console.log("Supabase API returned the expected Staging project reference.");
