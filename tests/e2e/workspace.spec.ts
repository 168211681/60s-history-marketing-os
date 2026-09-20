import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const routes = [
  ["/", "Make every second count."],
  ["/videos", "Video performance"],
  ["/analytics", "Channel analytics"],
  ["/insights", "Marketing insights"],
  ["/experiments", "Content experiments"],
  ["/scripts", "Script drafts"],
  ["/settings", "Settings & connections"],
] as const;
for (const [route, heading] of routes) {
  test(`${route} renders labeled samples without overflow or accessibility violations`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Sample data only.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator('nav [aria-current="page"]')).toHaveAttribute(
      "href",
      route,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
test("navigation, filtering, empty recovery and sorting work", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Videos", exact: true })
    .click();
  await expect(page).toHaveURL(/\/videos$/);
  await page.getByLabel("Search videos").fill("no-such-video");
  await expect(
    page.getByRole("heading", { name: "No videos found" }),
  ).toBeVisible();
  await page.getByLabel("Search videos").fill("warfare");
  await expect(page.getByRole("status")).toHaveText("2 of 6 sample videos");
  await page.getByLabel("Search videos").fill("");
  await page.getByLabel("Sort by").selectOption("views");
  await expect(page.locator(".video-list li").first()).toContainText(
    "One day inside a Roman legion",
  );
  for (const name of ["Analytics", "Insights", "Experiments", "Scripts", "Settings", "Dashboard"]) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name, exact: true })
      .click();
    await expect(
      page.getByRole("navigation").getByRole("link", { name, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
});
test("chart has exact values and AI analysis remains optional", async ({
  page,
}) => {
  await page.goto("/analytics");
  await page.getByText("View weekly sample values").click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "51,000", exact: true }),
  ).toBeVisible();
  await page.goto("/insights");
  await expect(
    page.getByRole("heading", { name: "AI marketing analysis" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate AI analysis" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No provider? Deterministic insights still work" }),
  ).toBeVisible();
});
test("connection controls fail closed when credentials are absent", async ({
  page,
  request,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Authentication is not configured" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect YouTube channel" }),
  ).toHaveCount(0);
  const connect = await request.post("/api/youtube/connect", {
    headers: { Origin: "http://127.0.0.1:3000" },
  });
  expect(connect.status()).toBe(403);
  const sync = await request.post("/api/youtube/sync", {
    headers: { Origin: "http://127.0.0.1:3000" },
  });
  expect(sync.status()).toBe(403);
  const callback = await request.get("/auth/callback?code=untrusted");
  expect(callback.status()).toBe(503);
});
test("unknown route has a 404 and recovery link", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "Return to dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Make every second count." }),
  ).toBeVisible();
});
test("keyboard users can skip to content", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop keyboard-specific check");
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
