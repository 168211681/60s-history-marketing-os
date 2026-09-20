const baseUrl = process.env.DEPLOYMENT_URL ?? process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
const routes = ["/", "/videos", "/analytics", "/insights", "/settings", "/scripts", "/experiments"];
const failures = [];

function endpoint(path) {
  return new URL(path, baseUrl).toString();
}

async function checkPage(path) {
  const response = await fetch(endpoint(path), { redirect: "error" });
  if (response.status !== 200) {
    failures.push(`${path}: expected HTTP 200, received ${response.status}`);
    return;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) failures.push(`${path}: expected an HTML response`);
  const body = await response.text();
  if (body.includes("__next_error__") || body.includes("Application error")) {
    failures.push(`${path}: response contains an application error marker`);
  }
}

async function main() {
  let root;
  try {
    root = await fetch(endpoint("/"), { redirect: "error" });
    if (root.status !== 200) failures.push(`/: expected HTTP 200, received ${root.status}`);
    if (root.headers.get("x-content-type-options") !== "nosniff") failures.push("/: missing x-content-type-options: nosniff");
    if (root.headers.get("x-frame-options") !== "DENY") failures.push("/: missing x-frame-options: DENY");
  } catch (error) {
    failures.push(`/: request failed (${error instanceof Error ? error.message : "unknown error"})`);
  }

  for (const route of routes.slice(1)) {
    try {
      await checkPage(route);
    } catch (error) {
      failures.push(`${route}: request failed (${error instanceof Error ? error.message : "unknown error"})`);
    }
  }

  try {
    const response = await fetch(endpoint("/api/media/images"), { redirect: "error" });
    if (response.status !== 200) failures.push(`/api/media/images: expected HTTP 200, received ${response.status}`);
    const payload = await response.json().catch(() => null);
    if (!payload || !Array.isArray(payload.assets)) failures.push("/api/media/images: expected an assets array");
  } catch (error) {
    failures.push(`/api/media/images: request failed (${error instanceof Error ? error.message : "unknown error"})`);
  }

  if (failures.length) {
    console.error(`Deployment verification failed for ${baseUrl}`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Deployment verification passed for ${baseUrl}`);
}

await main();
