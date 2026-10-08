import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import type { BatchPreview, BatchPreviewItem } from "../../src/lib/clipforge/batch-classification";

const ids = [1, 2, 3].map((value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`);
const previewPath = "/api/content-items/classification-batch/preview";
let bundle: string;

test.beforeAll(async () => {
  // Exercise the actual component without adding an authenticated test route,
  // contacting a database, or issuing any real classification requests.
  const result = await build({
    entryPoints: ["tests/fixtures/batch-classification.tsx"],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  });
  bundle = result.outputFiles[0].text;
});

function preview(actions: BatchPreviewItem["action"][]): BatchPreview {
  return {
    limit: 5,
    limitKind: "per-run",
    newRequestCount: actions.filter((action) => action === "generate").length,
    skippedCount: actions.filter((action) => action === "skip").length,
    separateDecisionCount: actions.filter((action) => action === "decide").length,
    items: actions.map((action, index) => ({
      id: ids[index],
      title: `Sample clip ${index + 1}`,
      projectId: "00000000-0000-4000-8000-000000000090",
      projectName: "Fictional test project",
      action,
      state: action === "skip" ? "Pending review" : action === "decide" ? "Stale" : "Not generated",
    })),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mountBatch(page: Page, options: {
  failure?: "http" | "network" | "malformed" | "foreign";
  statuses?: number[];
  initial?: BatchPreview;
} = {}) {
  const generation = deferred();
  const refresh = deferred();
  const calls = { previews: 0, classified: [] as string[] };
  const statuses = options.statuses ?? [200, 200, 200];
  await page.route("**/batch-component-test", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body><div id="root"></div><script src="/batch-component-test.js"></script></body></html>',
  }));
  await page.route("**/batch-component-test.js", (route) => route.fulfill({
    contentType: "text/javascript",
    body: bundle,
  }));
  await page.route(`**${previewPath}`, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ ids });
    calls.previews += 1;
    if (calls.previews === 1) {
      await route.fulfill({ json: options.initial ?? preview(["generate", "generate", "generate"]) });
      return;
    }
    if (calls.previews === 2) {
      await refresh.promise;
      if (options.failure === "network") return route.abort("failed");
      if (options.failure === "http") return route.fulfill({ status: 500, json: { error: "Preview unavailable." } });
      if (options.failure === "malformed") return route.fulfill({ json: { items: [] } });
      if (options.failure === "foreign") {
        const invalid = preview(["generate"]);
        invalid.items[0].id = "00000000-0000-4000-8000-000000000099";
        return route.fulfill({ json: invalid });
      }
    }
    await route.fulfill({ json: preview(statuses.map((status) => status === 200 ? "skip" : "generate")) });
  });
  await page.route("**/api/content-items/*/classify", async (route) => {
    expect(route.request().method()).toBe("POST");
    calls.classified.push(route.request().url().split("/").at(-2)!);
    if (calls.classified.length === 1) await generation.promise;
    const status = statuses[calls.classified.length - 1];
    await route.fulfill({ status, json: status === 200 ? {} : { error: "AI_INVALID_RESPONSE" } });
  });
  await page.goto("/batch-component-test");
  await expect(page.getByRole("checkbox")).toHaveCount(3);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Preview batch" }).click();
  await expect(page.getByRole("button", { name: "Confirm and generate" })).toBeEnabled();
  return { calls, generation, refresh };
}

async function confirmRepeatedly(page: Page) {
  await page.getByRole("button", { name: "Confirm and generate" }).evaluate((button) => {
    // Same-event-loop clicks exercise the ref guard before React rerenders.
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
}

test("generation consumes its preview, refreshes counts and statuses, and preserves success results", async ({ page }) => {
  const { calls, generation, refresh } = await mountBatch(page);
  await confirmRepeatedly(page);
  await expect.poll(() => calls.classified.length).toBe(1);
  await expect(page.getByText(/^About /)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm and generate" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview batch" })).toBeDisabled();
  generation.resolve();
  await expect.poll(() => calls.previews).toBe(2);
  await expect(page.locator("ol.batch-list").getByText("Success", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Previewing…" })).toBeDisabled();
  await expect(page.getByRole("checkbox").first()).toBeDisabled();
  refresh.resolve();
  await expect(page.getByText(/^About /)).toHaveText("About 0 new classification requests. No price is shown because token usage and provider rates are not measured. 3 skipped. 0 need a separate decision.");
  await expect(page.locator("ul.batch-list").getByText(/Pending review/)).toHaveCount(3);
  await expect(page.locator("ol.batch-list").getByText("Success", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Confirm and generate" })).toHaveCount(0);
  expect(calls).toEqual({ previews: 2, classified: ids });
});

test("mixed results survive automatic and manual refresh without retrying a failed classification", async ({ page }) => {
  const { calls, generation, refresh } = await mountBatch(page, { statuses: [200, 502, 200] });
  await confirmRepeatedly(page);
  generation.resolve();
  await expect.poll(() => calls.previews).toBe(2);
  const results = page.locator("ol.batch-list");
  await expect(results.getByText("Success", { exact: true })).toHaveCount(2);
  await expect(results.getByText("Failed", { exact: true })).toHaveCount(1);
  const before = await results.innerText();
  refresh.resolve();
  await expect(page.getByText(/^About /)).toHaveText("About 1 new classification request. No price is shown because token usage and provider rates are not measured. 2 skipped. 0 need a separate decision.");
  await expect(page.getByRole("button", { name: "Confirm and generate" })).toBeEnabled();
  await expect.poll(() => results.innerText()).toBe(before);
  await page.getByRole("button", { name: "Preview batch" }).click();
  await expect(page.getByRole("button", { name: "Preview batch" })).toBeEnabled();
  await expect.poll(() => results.innerText()).toBe(before);
  expect(calls).toEqual({ previews: 3, classified: ids });
});

for (const failure of ["http", "network", "malformed", "foreign"] as const) {
  test(`${failure} refresh failure clears the actionable preview and requires manual refresh`, async ({ page }) => {
    const { calls, generation, refresh } = await mountBatch(page, { failure, statuses: [200, 502, 200] });
    await confirmRepeatedly(page);
    generation.resolve();
    await expect.poll(() => calls.previews).toBe(2);
    const results = page.locator("ol.batch-list");
    await expect(results.getByText("Failed", { exact: true })).toHaveCount(1);
    const before = await results.innerText();
    refresh.resolve();
    await expect(page.getByRole("alert")).toContainText("Click Preview batch to refresh before generating.");
    await expect(page.getByText(/^About /)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm and generate" })).toHaveCount(0);
    await expect.poll(() => results.innerText()).toBe(before);
    expect(calls).toEqual({ previews: 2, classified: ids });
    await page.getByRole("button", { name: "Preview batch" }).click();
    await expect(page.getByRole("button", { name: "Confirm and generate" })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect.poll(() => results.innerText()).toBe(before);
    expect(calls).toEqual({ previews: 3, classified: ids });
  });
}

test("summary separates sentences and uses singular grammar for a separate decision", async ({ page }) => {
  await mountBatch(page, { initial: preview(["generate", "skip", "decide"]) });
  await expect(page.getByText(/^About /)).toHaveText("About 1 new classification request. No price is shown because token usage and provider rates are not measured. 1 skipped. 1 needs a separate decision.");
});

for (const event of ["pagehide", "test:unmount"]) {
  test(`${event} during generation stops remaining requests and automatic refresh`, async ({ page }) => {
    const { calls, generation } = await mountBatch(page);
    await confirmRepeatedly(page);
    await expect.poll(() => calls.classified.length).toBe(1);
    await page.evaluate((name) => window.dispatchEvent(new Event(name)), event);
    const response = page.waitForResponse((res) => res.url().endsWith("/classify"));
    generation.resolve();
    await response;
    if (event === "pagehide") {
      await expect(page.getByRole("button", { name: "Preview batch" })).toBeEnabled();
      await expect(page.locator("ol.batch-list").getByText("Not started", { exact: true })).toHaveCount(2);
      await expect(page.getByRole("button", { name: "Confirm and generate" })).toHaveCount(0);
    } else {
      await expect(page.locator("#root")).toBeEmpty();
    }
    expect(calls).toEqual({ previews: 1, classified: [ids[0]] });
  });

  test(`${event} during refresh does not restore a late actionable preview`, async ({ page }) => {
    const { calls, generation, refresh } = await mountBatch(page, { statuses: [200, 502, 200] });
    await confirmRepeatedly(page);
    generation.resolve();
    await expect.poll(() => calls.previews).toBe(2);
    await page.evaluate((name) => window.dispatchEvent(new Event(name)), event);
    const response = page.waitForResponse((res) => res.url().endsWith(previewPath));
    refresh.resolve();
    await response;
    if (event === "pagehide") {
      await expect(page.getByRole("button", { name: "Preview batch" })).toBeEnabled();
      await expect(page.getByText(/^About /)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Confirm and generate" })).toHaveCount(0);
      await expect(page.locator("ol.batch-list").getByText("Failed", { exact: true })).toHaveCount(1);
    } else {
      await expect(page.locator("#root")).toBeEmpty();
    }
    expect(calls).toEqual({ previews: 2, classified: ids });
  });
}
