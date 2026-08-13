import { expect, test } from "@playwright/test";

test("skip link moves keyboard focus into the restaurant list", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "Desktop Chrome",
    "Desktop viewport only",
  );
  await page.goto("/");
  // Skeleton rows have `.row` but no `.row-toggle`; wait for the streamed list.
  await expect(page.locator(".row-toggle").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to restaurant list/i });
  await expect(skip).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page.keyboard.press("Tab");
  const activeName = await page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return "";
    return (el.getAttribute("aria-label") || el.textContent || "").trim();
  });
  expect(activeName.toLowerCase()).not.toMatch(/^(zoom|leaflet|\d+$)/);
  await expect(page.locator(".row-toggle").first()).toBeFocused();
});

test("map markers and clusters are not sequential tab stops", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "Desktop Chrome",
    "Desktop viewport only",
  );
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();

  const tabbableMarkers = await page
    .locator(".map-pane .leaflet-marker-icon")
    .evaluateAll(
      (icons) => icons.filter((el) => (el as HTMLElement).tabIndex >= 0).length,
    );

  expect(tabbableMarkers).toBe(0);
});

test("desktop map widen toggle is keyboard operable and Escape collapses", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "Desktop Chrome",
    "Desktop viewport only",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible({
    timeout: 30_000,
  });

  const mapPane = page.locator("#restaurant-map-panel");
  const expandToggle = page.locator(".map-expand-toggle");
  await expect(expandToggle).toBeVisible();
  await expect(expandToggle).toHaveAccessibleName("Widen map");
  await expect(expandToggle).toHaveAttribute("aria-pressed", "false");
  await expect(mapPane).not.toHaveClass(/desktop-expanded/);

  await expandToggle.focus();
  await expect(expandToggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(expandToggle).toHaveAccessibleName("Narrow map");
  await expect(expandToggle).toHaveAttribute("aria-pressed", "true");
  await expect(mapPane).toHaveClass(/desktop-expanded/);

  await page.keyboard.press("Escape");
  await expect(expandToggle).toHaveAccessibleName("Widen map");
  await expect(expandToggle).toHaveAttribute("aria-pressed", "false");
  await expect(mapPane).not.toHaveClass(/desktop-expanded/);

  await expandToggle.focus();
  await page.keyboard.press("Space");
  await expect(mapPane).toHaveClass(/desktop-expanded/);
  await page.keyboard.press("Escape");
  await expect(mapPane).not.toHaveClass(/desktop-expanded/);
});
