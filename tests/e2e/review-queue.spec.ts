import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { parseReviewFilters } from "../../src/lib/clipforge/review-queue";
import { reviewFixtureData, reviewId } from "../fixtures/review-queue-data";

let bundle: string;
let css: string;
test.beforeAll(async () => {
  bundle = (await build({
    entryPoints: ["tests/fixtures/review-queue.tsx"], bundle: true, write: false,
    format: "iife", platform: "browser",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  })).outputFiles[0].text;
  // Use the actual production CSS, including Tailwind's reset, for phone tests.
  const paths = await readdir(".next/static/css", { recursive: true });
  css = (await Promise.all(paths.filter((path) => path.endsWith(".css")).map((path) => readFile(`.next/static/css/${path}`, "utf8")))).join("\n");
});

async function mountQueue(page: Page, mode?: "loading" | "failure") {
  const unsafeRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" || new URL(request.url()).pathname.startsWith("/api/")) unsafeRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.route("**/review-fixture.js", (route) => route.fulfill({ contentType: "text/javascript", body: bundle }));
  await page.route("**/review-fixture.css", (route) => route.fulfill({ contentType: "text/css", body: css }));
  await page.route(/\/review(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const filters = parseReviewFilters(Object.fromEntries(url.searchParams));
    const data = await reviewFixtureData(filters ?? parseReviewFilters({})!);
    const config = JSON.stringify({ filters, data, mode: filters ? mode : "invalid" }).replace(/</g, "\\u003c");
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Review queue test</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/review-fixture.css"></head><body><main id="main"><div id="root"></div></main><script>window.reviewFixture=${config}</script><script src="/review-fixture.js"></script></body></html>` });
  });
  await page.goto("/review");
  return unsafeRequests;
}

test("owner queue cards show every state, reviewed staleness, null confidence, and accessible mobile layout", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await mountQueue(page);
  await expect(page.getByRole("heading", { name: "Metadata review queue", exact: true })).toBeVisible();
  await expect(page.locator(".review-card")).toHaveCount(20);
  const totals = page.getByRole("navigation", { name: "Review state totals" });
  for (const label of ["All 28", "Pending review 1", "Stale 1", "Accepted 2", "Rejected 1", "Not generated 22", "Superseded 1"]) {
    await expect(totals.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  const first = page.locator(".review-card").first();
  await expect(first.getByText("Confidence: 92%", { exact: true })).toBeVisible();
  await expect(first.getByText("Confidence: 0%", { exact: true })).toBeVisible();
  await expect(first.getByText("Confidence: Unavailable", { exact: true })).toBeVisible();
  const acceptedStale = page.locator(".review-card").nth(5);
  await expect(acceptedStale.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(acceptedStale.getByText(/The recorded review decision is retained/)).toBeVisible();
  await expect(page.getByText("Historical suggestion — superseded, not pending review.")).toBeVisible();
  await expect(page.locator(".review-card").nth(4)).toContainText("No current suggestion");
  for (const link of await page.getByRole("link", { name: /^Review clip:/ }).all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await expect(page.getByRole("button", { name: /Accept|Reject|Regenerate|Generate/ })).toHaveCount(0);
  expect(await page.content()).not.toContain("PRIVATE_PROVIDER");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.getByRole("searchbox", { name: "Search title" }).evaluate((input) => parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("review-queue.png") });
});

test("search, project, states, pagination, empty pages, and owned review links preserve context", async ({ page }) => {
  const requests = await mountQueue(page);
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".review-card")).toHaveCount(8);
  await expect(page.getByRole("link", { name: "Review clip: Sample clip 21", exact: true })).toHaveAttribute("href", `/library/${reviewId(21)}`);
  await page.getByRole("link", { name: "Previous page" }).click();
  await page.getByRole("navigation", { name: "Review state totals" }).getByRole("link", { name: "Accepted 2", exact: true }).click();
  await expect(page.locator(".review-card")).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "Review state", exact: true })).toHaveValue("accepted");
  await page.getByRole("combobox", { name: "Review state", exact: true }).selectOption("all");
  await page.getByRole("combobox", { name: "Project", exact: true }).selectOption(reviewId(90));
  await page.getByLabel("Search title").fill("Antikythera");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(".review-card")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /^Review clip:/ })).toHaveAttribute("href", `/library/${reviewId(1)}`);
  await expect(page.getByRole("navigation", { name: "Review state totals" }).getByRole("link", { name: "All 1", exact: true })).toBeVisible();
  await page.getByLabel("Search title").fill("Missing title");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: "No matching clips" })).toBeVisible();
  await page.goto("/review?page=99");
  await expect(page.getByRole("heading", { name: "No clips on this page" })).toBeVisible();
  await page.getByRole("link", { name: "First page", exact: true }).click();
  await expect(page.locator(".review-card")).toHaveCount(20);
  await page.route(`**/library/${reviewId(1)}`, (route) => route.fulfill({ contentType: "text/html", body: "<h1>Owned clip test destination</h1>" }));
  await page.getByRole("link", { name: /^Review clip:/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/library/${reviewId(1)}$`));
  expect(requests).toEqual([]);
});

test("loading and failure states expose no stale cards or internal errors", async ({ page }) => {
  await mountQueue(page, "loading");
  await expect(page.getByRole("status")).toHaveText("Loading metadata review queue…");
  await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true");
  await page.unrouteAll();
  const requests = await mountQueue(page, "failure");
  await expect(page.getByRole("alert")).toHaveText("We could not load your review queue. Try again in a moment.");
  await expect(page.locator(".review-card")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/review");
  await page.goto("/review?page=-1");
  await expect(page.getByRole("heading", { name: "Check your filters" })).toBeVisible();
  expect(requests).toEqual([]);
});

test("real /review requires an owner session and provides workspace navigation", async ({ page }) => {
  const response = await page.goto("/review");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Review queue is private" })).toBeVisible();
  await expect(page.locator(".review-card")).toHaveCount(0);
  await expect(page.locator('nav a[aria-current="page"]')).toHaveAttribute("href", "/review");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
