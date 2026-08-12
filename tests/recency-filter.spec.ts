import { expect, test, type Locator, type Page } from "@playwright/test";

// The recency filter lives in the (shared) filter bar; exercise it on desktop.
test.describe("Recency filter", () => {
  async function resultCount(page: Page): Promise<number> {
    const txt = (await page.locator(".result-count").textContent()) ?? "";
    return parseInt(txt.trim(), 10);
  }

  // Open the Recency dropdown, retrying the click until the panel appears. The trigger's
  // click handler only works after hydration, which lags the SSR'd markup — a first click
  // can land (focusing the button) before Svelte wires it up, leaving the panel closed.
  async function openRecency(page: Page): Promise<Locator> {
    const trigger = page.getByRole("button", { name: "Recency", exact: true });
    const panel = page.locator(".recency-panel");
    await expect(async () => {
      if (!(await panel.isVisible())) await trigger.click();
      await expect(panel).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    return panel;
  }

  // Set the range slider to a fraction (0..1) of its [min,max] and fire the native
  // input/change events Svelte listens for (a bare .value assignment won't notify it).
  async function setSliderFraction(page: Page, fraction: number): Promise<void> {
    const slider = page.getByRole("slider", {
      name: /show comments no older than/i,
    });
    await slider.evaluate((el, frac) => {
      const input = el as HTMLInputElement;
      const min = Number(input.min);
      const max = Number(input.max);
      const value = Math.round(min + (max - min) * (frac as number));
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, fraction);
  }

  async function barHeights(panel: Locator): Promise<string[]> {
    return panel
      .locator(".bar")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).style.height));
  }

  test("renders the histogram, engages and clears the freshness cutoff", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "Desktop viewport only");
    await page.goto("/");

    await expect(page.locator(".result-count")).toContainText(/\d+ restaurants?/);
    const initialCount = await resultCount(page);
    expect(initialCount).toBeGreaterThan(0);

    const panel = await openRecency(page);
    // All 30 bins render (zero-count bins included); the slider is interactive.
    await expect(panel.locator(".bar")).toHaveCount(30);
    await expect(
      page.getByRole("slider", { name: /show comments no older than/i }),
    ).toBeVisible();

    // Engage: push the cutoff to the most-recent end → drops older-only restaurants.
    await setSliderFraction(page, 1);
    await expect(page.locator(".recency-pill")).toBeVisible();
    await expect.poll(() => page.url()).toContain("since=");
    await expect.poll(() => resultCount(page)).toBeLessThan(initialCount);

    // Reset restores the full list and clears the URL param + pill.
    await panel.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.locator(".recency-pill")).toHaveCount(0);
    await expect.poll(() => page.url()).not.toContain("since=");
    await expect.poll(() => resultCount(page)).toBe(initialCount);
  });

  test("histogram reacts to other active filters; time axis stays fixed", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "Desktop viewport only");
    await page.goto("/");
    await expect(page.locator(".result-count")).toContainText(/\d+ restaurants?/);

    // Histogram with no other filter active.
    let panel = await openRecency(page);
    await expect(panel.locator(".bar")).toHaveCount(30);
    const heightsBefore = await barHeights(panel);
    const axisBefore = await panel.locator(".axis").innerText();

    // Apply the most common cuisine (opening Cuisine closes Recency via mutual exclusion).
    await page.getByRole("button", { name: "Cuisine", exact: true }).click();
    await expect(page.locator("#cuisine-listbox")).toBeVisible();
    await page.locator("#cuisine-listbox .dropdown-item").first().click();

    // Reopen Recency: densities should reflect the narrower selection…
    panel = await openRecency(page);
    await expect(panel.locator(".bar")).toHaveCount(30);
    const heightsAfter = await barHeights(panel);
    const axisAfter = await panel.locator(".axis").innerText();

    expect(heightsAfter.join(",")).not.toBe(heightsBefore.join(","));
    // …while the time axis (full-dataset extent) stays fixed.
    expect(axisAfter).toBe(axisBefore);
  });
});
