import { expect, test } from "@playwright/test";

test.describe("Shareable URL state", () => {
  test("SSR title reflects cuisine filter from query params", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "Desktop viewport only",
    );
    await page.goto("/?cuisine=Mexican");

    await expect(page).toHaveTitle(/Mexican — OC Food Recs/);
    await expect(page.locator(".result-count")).toContainText(
      /\d+ restaurants/,
    );
  });

  test("search query param filters the list", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "Desktop viewport only",
    );
    await page.goto("/?q=zzznomatchxyz");

    await expect(page.locator(".empty-title")).toHaveText(
      "No restaurants found",
    );
  });
});
