import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { reviewFixtureData, reviewId } from "../fixtures/review-queue-data";
import { parseReviewFilters, type ReviewQueueData } from "../../src/lib/clipforge/review-queue";
import type { BulkConfirmation, BulkPreview, BulkSelection } from "../../src/lib/clipforge/bulk-review";
import { appOrigin } from "../../src/lib/auth/config";

let bundle: string, css: string;
test.beforeAll(async () => {
  bundle = (await build({ entryPoints: ["tests/fixtures/review-queue.tsx"], bundle: true, write: false, format: "iife", platform: "browser", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" } })).outputFiles[0].text;
  const paths = await readdir(".next/static/css", { recursive: true });
  css = (await Promise.all(paths.filter((p) => p.endsWith(".css")).map((p) => readFile(`.next/static/css/${p}`, "utf8")))).join("\n");
});

async function mount(page: Page, options: { failFirstConfirm?: boolean; conflict?: boolean; stale?: boolean; previewFailure?: boolean } = {}) {
  const previews: BulkSelection[] = [], confirmations: BulkConfirmation[] = [], unsafe: string[] = [];
  let data: ReviewQueueData;
  await page.route("**/bulk-fixture.js", (r) => r.fulfill({ contentType: "text/javascript", body: bundle }));
  await page.route("**/bulk-fixture.css", (r) => r.fulfill({ contentType: "text/css", body: css }));
  await page.route(/\/review(?:\?.*)?$/, async (r) => {
    const filters = parseReviewFilters(Object.fromEntries(new URL(r.request().url()).searchParams))!;
    data = await reviewFixtureData(filters);
    const sample = (await reviewFixtureData(parseReviewFilters({})!)).items[0].suggestion!;
    data.items = data.items.map((item, i) => i < 12 ? { ...item, state: "pending", suggestion: { ...sample, status: "pending", stale: false } } : item);
    const config = JSON.stringify({ filters, data }).replace(/</g, "\\u003c");
    await r.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><title>Fictional bulk review test</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bulk-fixture.css"></head><body><main id="main"><div id="root"></div></main><script>window.reviewFixture=${config}</script><script src="/bulk-fixture.js"></script></body></html>` });
  });
  await page.route("**/api/content-items/bulk-review/preview", async (r) => {
    const input = r.request().postDataJSON() as BulkSelection; previews.push(input);
    if (options.previewFailure) return r.fulfill({ status: 503, json: { error: "Could not load the preview. Try again." } });
    const items: BulkPreview["items"] = input.items.map((choice) => {
      const item = data.items.find((i) => i.id === choice.contentItemId)!;
      return { contentItemId: item.id, title: item.title, projectName: item.projectName, current: { topic: "Current topic", content_pillar: "Current pillar", production_type: "unknown" }, suggestionId: reviewId(100 + data.items.indexOf(item)), version: "e".repeat(64), suggestion: item.suggestion, availableFields: ["topic", "content_pillar", "production_type"], eligible: !options.stale, fields: choice.fields, warnings: options.stale ? ["Only current, pending, non-stale suggestions can be reviewed in a batch."] : input.action === "accept" && !choice.fields.length ? ["Choose at least one field for this clip."] : [] };
    });
    const affected = items.filter((i) => !i.warnings.length).length;
    const body: BulkPreview = { requestId: reviewId(500 + previews.length), action: input.action, items, affected, canConfirm: affected === items.length };
    await r.fulfill({ json: body });
  });
  await page.route("**/api/content-items/bulk-review/confirm", async (r) => {
    const input = r.request().postDataJSON() as BulkConfirmation; confirmations.push(input);
    if (options.conflict) return r.fulfill({ status: 409, json: { error: "The batch changed. Nothing was changed. Refresh and preview again.", conflict: true } });
    if (options.failFirstConfirm && confirmations.length === 1) return r.fulfill({ status: 503, json: { error: "The outcome is unknown. Retry this same confirmation to check safely." } });
    await r.fulfill({ json: { requestId: input.requestId, action: input.action, affected: input.items.length, completedAt: "2026-10-09T00:00:00Z", replayed: confirmations.length > 1 } });
  });
  page.on("request", (r) => { if (r.method() !== "GET" && !/\/bulk-review\/(preview|confirm)$/.test(new URL(r.url()).pathname)) unsafe.push(r.url()); });
  await page.goto("/review");
  return { previews, confirmations, unsafe };
}
async function inspect(page: Page, action: "accept" | "reject" = "accept") {
  await page.getByRole("checkbox", { name: /^Select / }).first().check();
  await page.getByRole("button", { name: `Preview ${action}` }).click();
  await expect(page.getByRole("heading", { name: "Inspect selected suggestions" })).toBeFocused();
}
async function ready(page: Page, action: "accept" | "reject" = "accept") {
  await inspect(page, action);
  if (action === "accept") await page.getByRole("checkbox", { name: /^Accept topic for / }).check();
  await page.getByRole("button", { name: "Review batch" }).click();
  await expect(page.getByRole("heading", { name: "Confirm reviewed batch" })).toBeVisible();
}

test("bulk selection stays on the page, caps at ten, and resets for navigation and filters", async ({ page }) => {
  const calls = await mount(page);
  const boxes = page.getByRole("checkbox", { name: /^Select / });
  await expect(boxes).toHaveCount(12);
  for (let i = 0; i < 10; i++) await boxes.nth(i).check();
  await expect(boxes.nth(10)).toBeDisabled(); await expect(boxes.nth(11)).toBeDisabled();
  await boxes.first().uncheck(); await expect(boxes.nth(10)).toBeEnabled();
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preview accept" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /^Select / }).first().check();
  await page.getByLabel("Search title").fill("Antikythera");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("button", { name: "Preview accept" })).toBeDisabled();
  expect(calls.previews).toHaveLength(0); expect(calls.confirmations).toHaveLength(0); expect(calls.unsafe).toEqual([]);
});

test("accept requires explicit per-clip fields, a validated preview, and a separate confirmation", async ({ page }, testInfo) => {
  const calls = await mount(page);
  await inspect(page);
  await expect(page.getByText("Current: Current topic", { exact: true })).toBeVisible();
  await expect(page.locator(".bulk-preview-item").getByText("Confidence: Unavailable", { exact: true })).toBeVisible();
  await expect(page.locator(".bulk-preview-item input:checked")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review batch" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Confirm accept/ })).toHaveCount(0);
  const topic = page.getByRole("checkbox", { name: /^Accept topic for / });
  await topic.focus(); await topic.press("Space"); await expect(topic).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("bulk-review-fields.png") });
  await page.getByRole("button", { name: "Review batch" }).click();
  expect(calls.previews).toHaveLength(2); expect(calls.previews[1].items[0].fields).toEqual(["topic"]);
  await expect(page.getByRole("heading", { name: "Confirm reviewed batch" })).toBeFocused();
  await expect(topic).toBeDisabled(); expect(calls.confirmations).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm accept 1 clip" }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText("1 clip accepted. All changes were saved together.")).toBeVisible();
  expect(calls.confirmations).toHaveLength(1); expect(calls.confirmations[0].items[0].fields).toEqual(["topic"]); expect(calls.unsafe).toEqual([]);
  await expect(page.getByRole("link", { name: /^Review clip:/ }).first()).toHaveAttribute("href", `/library/${reviewId(1)}`);
});

test("reject is explicit, keeps canonical fields, and never auto-retries an uncertain confirmation", async ({ page }) => {
  const calls = await mount(page, { failFirstConfirm: true }); await ready(page, "reject");
  await expect(page.getByText("This pending suggestion will be rejected. Canonical metadata will stay unchanged.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm reject 1 clip" }).click();
  await expect(page.getByRole("alert")).toContainText("outcome is unknown");
  await expect(page.getByRole("button", { name: "Cancel preview" })).toBeDisabled();
  await page.waitForTimeout(250); expect(calls.confirmations).toHaveLength(1);
  await page.getByRole("button", { name: "Retry same confirmation" }).click();
  await expect(page.getByText("1 clip rejected. All changes were saved together.")).toBeVisible();
  expect(calls.confirmations).toHaveLength(2); expect(calls.confirmations[1]).toEqual(calls.confirmations[0]); expect(calls.confirmations[0].items[0].fields).toEqual([]);
});

test("confirmation conflict clears the actionable preview and reports no partial success", async ({ page }) => {
  const calls = await mount(page, { conflict: true }); await ready(page);
  await page.getByRole("button", { name: "Confirm accept 1 clip" }).click();
  await expect(page.getByRole("alert")).toContainText("Nothing was changed");
  await expect(page.getByRole("button", { name: /^Confirm / })).toHaveCount(0);
  await expect(page.getByText(/All changes were saved/)).toHaveCount(0);
  expect(calls.confirmations).toHaveLength(1);
});

test("stale warnings and preview failure cannot produce confirmation", async ({ page }) => {
  const calls = await mount(page, { stale: true }); await inspect(page);
  await expect(page.getByRole("alert")).toContainText("non-stale");
  await expect(page.getByRole("button", { name: "Review batch" })).toBeDisabled();
  expect(calls.confirmations).toHaveLength(0);
  await page.unrouteAll();
  const failed = await mount(page, { previewFailure: true });
  await page.getByRole("checkbox", { name: /^Select / }).first().check(); await page.getByRole("button", { name: "Preview accept" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not load");
  await expect(page.getByRole("button", { name: /^Confirm / })).toHaveCount(0); expect(failed.confirmations).toHaveLength(0);
});

test("pagehide prevents a later confirmation and visiting the queue sends no mutation", async ({ page }) => {
  const calls = await mount(page); expect(calls.previews).toHaveLength(0); expect(calls.confirmations).toHaveLength(0);
  await ready(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  await page.getByRole("button", { name: "Confirm accept 1 clip" }).click();
  expect(calls.confirmations).toHaveLength(0);
});

test("real endpoints refuse unauthenticated or cross-origin confirmations", async ({ request }) => {
  for (const path of ["preview", "confirm"]) {
    const route = `/api/content-items/bulk-review/${path}`;
    const cross = await request.post(route, { headers: { origin: "https://attacker.test" }, data: {} });
    expect(cross.status()).toBe(403);
    const anonymous = await request.post(route, { headers: { origin: "http://127.0.0.1:3000" }, data: {} });
    // With no configured origin, CSRF denies the request before auth. With the
    // local origin configured, the real owner check returns Unauthorized.
    expect(anonymous.status()).toBe(appOrigin() === "http://127.0.0.1:3000" ? 401 : 403);
  }
});

test("unmount aborts a pending preview and ignores its late response", async ({ page }) => {
  const calls = await mount(page);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/content-items/bulk-review/preview", async (route) => { await held; await route.fulfill({ status: 503, json: { error: "Late response" } }).catch(() => {}); });
  await page.getByRole("checkbox", { name: /^Select / }).first().check();
  const request = page.waitForRequest("**/api/content-items/bulk-review/preview");
  await page.getByRole("button", { name: "Preview accept" }).click(); await request;
  await page.evaluate(() => window.dispatchEvent(new Event("test:unmount"))); release();
  await expect(page.getByRole("heading", { name: "Metadata review queue" })).toHaveCount(0);
  expect(calls.confirmations).toHaveLength(0); expect(errors).toEqual([]);
});
