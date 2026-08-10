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
    await page.goto("/");
    const initialRow = page.locator(".row[id^='restaurant-']").first();
    await expect(initialRow).toBeVisible();
    const slug = await initialRow.getAttribute("id");
    expect(slug).toMatch(/^restaurant-.+/);

    await page.goto(`/?restaurant=${slug!.replace("restaurant-", "")}`);

    const row = page.locator(`#${slug}`);
    await expect(row).toHaveClass(/expanded/);
    await expect(row.locator(".row-toggle")).toHaveAttribute(
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
    const mexicanOption = page
      .locator("#cuisine-listbox [role='option']")
      .filter({ hasText: /Mexican/ })
      .first();
    await expect(async () => {
      if (!(await mexicanOption.isVisible())) {
        await cuisineTrigger.click();
      }
      await expect(mexicanOption).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });

    await mexicanOption.click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("cuisine"))
      .toBe("Mexican");
  });

  test("keyboard shortcuts focus search without blocking a slash query", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "Desktop viewport only",
    );
    await page.goto("/");

    const search = page.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await expect(async () => {
      await page.keyboard.press("/");
      await expect(search).toBeFocused({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await page.keyboard.type("/");

    await expect(search).toHaveValue("/");
  });

  test("share action copies the current view URL", async ({ page, context }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "Desktop viewport only",
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/?cuisine=Mexican");

    const toast = page.getByText("Share link copied to clipboard!");
    await expect(async () => {
      await page.getByRole("button", { name: /share view/i }).click();
      await expect(toast).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(
      "cuisine=Mexican",
    );
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
