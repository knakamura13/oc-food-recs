import { expect, test } from "@playwright/test";

test("hero shows a dynamic subtitle and no hardcoded source attribution", async ({ page }) => {
  await page.goto("/");

  const hero = page.locator(".hero");

  // Subtitle is data-driven: references a thread count and the comment count.
  await expect(hero.locator(".summary")).toContainText(/Reddit threads?/i);
  await expect(hero.locator(".summary")).toContainText(/community\s+comments/i);

  // The old "Source Reddit threads" section and the hardcoded r/orangecounty
  // attribution have been removed.
  await expect(hero.locator(".sources-label")).toHaveCount(0);
  await expect(hero.getByText(/comes directly from r\/orangecounty/i)).toHaveCount(0);
});
