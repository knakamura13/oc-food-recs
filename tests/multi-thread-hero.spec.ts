import { expect, test } from "@playwright/test";

test("hero reflects multiple Reddit source threads", async ({ page }) => {
  await page.goto("/");

  const hero = page.locator(".hero");
  await expect(hero.locator(".sources-label")).toHaveText(/Reddit threads/i);

  const sourceLinks = hero.locator('a[href*="reddit.com/r/orangecounty/comments"]');
  await expect(sourceLinks).toHaveCount(2);
});
