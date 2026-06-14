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

  test("restaurant deep link expands the matching row", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "Desktop viewport only",
    );
    await page.goto("/?restaurant=la-taco-spot");

    const row = page.locator("#restaurant-la-taco-spot");
    await expect(row).toHaveClass(/expanded/);
    await expect(row.locator(".row-header")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("client filter updates the URL via replaceState", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "Desktop viewport only",
    );
    await page.goto("/");

    const cuisineTrigger = page.getByRole("button", { name: /^cuisine$/i });
    await expect(async () => {
      if (!(await page.getByRole("option", { name: /mexican/i }).isVisible())) {
        await cuisineTrigger.click();
      }
      await expect(page.getByRole("option", { name: /mexican/i })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15000 });

    await page.getByRole("option", { name: /mexican/i }).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("cuisine"))
      .toBe("Mexican");
  });

  test("SSR meta tags reflect filtered views", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "Desktop viewport only",
    );
    await page.goto("/?cuisine=Mexican");

    const description = page.locator('meta[property="og:description"]');
    await expect(description).toHaveAttribute(
      "content",
      /community-recommended mom and pop restaurants/i,
    );

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl).toHaveAttribute("content", /cuisine=Mexican/);

    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /\/screenshot\.jpeg$/);
  });
});
