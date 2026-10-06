import { readFile } from "node:fs/promises";

export const EXPECTED_STAGING_PROJECT_REF = "haqpqifxlqpihkmhkwdu";
export const EXPECTED_STAGING_PROJECT_NAME = "60s-history-staging";

export function parseStagingProjectResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Staging project response is not valid JSON.");
  }
}

export function validateStagingProject(payload, options = {}) {
  const stagingRef = options.stagingRef ?? EXPECTED_STAGING_PROJECT_REF;
  const expectedName = options.expectedName ?? EXPECTED_STAGING_PROJECT_NAME;

  if (Array.isArray(payload)) {
    throw new Error("Staging project response must be one project object, not a project list.");
  }
  if (payload === null || typeof payload !== "object") {
    throw new Error("Staging project response must be a JSON object.");
  }

  const id = payload.id;
  const ref = payload.ref;
  const hasId = typeof id === "string" && id.length > 0;
  const hasRef = typeof ref === "string" && ref.length > 0;
  if (!hasId && !hasRef) {
    throw new Error("Staging project response is missing id and ref.");
  }
  if (hasId && id !== stagingRef) {
    throw new Error("Staging project id does not match the expected Staging project.");
  }
  if (hasRef && ref !== stagingRef) {
    throw new Error("Staging project ref does not match the expected Staging project.");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "name") && payload.name != null) {
    if (payload.name !== expectedName) {
      throw new Error("Staging project name does not match the expected Staging project.");
    }
  }

  return { id: hasId ? id : ref, ref: hasRef ? ref : id, name: payload.name ?? null };
}

async function main() {
  const [jsonPath, stagingRef] = process.argv.slice(2);
  if (!jsonPath || !stagingRef) {
    throw new Error("Usage: assert-staging-project-identity.mjs <json> <staging-ref>");
  }
  const payload = parseStagingProjectResponse(await readFile(jsonPath, "utf8"));
  const project = validateStagingProject(payload, { stagingRef });
  console.log(`Supabase API returned Staging project ${project.ref}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Staging project identity check failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
