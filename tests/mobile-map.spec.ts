import { expect, test } from "@playwright/test";

test.describe("Mobile map interaction", () => {
  test("minimized map hides Leaflet chrome; expanded shows controls and locks scroll", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Mobile Chrome",
      "Mobile viewport only",
    );
    await page.goto("/");

    const mapPane = page.locator(".map-pane");
    await expect(mapPane).toBeVisible();

    await expect(page.locator(".leaflet-container")).toBeVisible({
      timeout: 30_000,
    });

    const attributionText = page
      .locator(".map-panel")
      .getByText(/OpenStreetMap/i);
    await expect(attributionText).toBeHidden();

    await mapPane.click({ force: true });

    await expect(mapPane).toHaveClass(/portal-expanded/);
    await expect(page.locator(".map-panel")).not.toHaveClass(
      /map-leaflet-chrome-hidden-mobile/,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "class",
      /mobile-map-expanded-lock/,
    );
    await expect(attributionText).toBeVisible();

    const searchInput = page.getByRole("combobox", {
      name: /search restaurants/i,
    });
    await expect(searchInput).toBeVisible();
    await searchInput.click();
    await expect(searchInput).toBeFocused();

    const controls = page.locator(".controls-bar");
    const controlsBox = await controls.boundingBox();
    const paneBox = await mapPane.boundingBox();
    expect(controlsBox).toBeTruthy();
    expect(paneBox).toBeTruthy();
    if (controlsBox && paneBox) {
      expect(paneBox.y).toBeGreaterThanOrEqual(
        controlsBox.y + controlsBox.height - 2,
      );
    }

    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(100);
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(scrollYAfter).toBe(scrollYBefore);

    await page.locator(".map-close-btn").click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains(
            "mobile-map-expanded-lock",
          ),
        ),
      )
      .toBe(false);
    await expect(attributionText).toBeHidden();
  });

  test("desktop: inline map keeps Leaflet chrome and no mobile scroll lock", async ({
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
    await expect(
      page.locator(".map-panel").getByText(/OpenStreetMap/i),
    ).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute(
      "class",
      /mobile-map-expanded-lock/,
    );
  });
});
