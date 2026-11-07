import { expect, test } from '@playwright/test';

// Layout and load budgets. These guard the problems unit and behavior tests miss:
// clipped toolbars, wrapped control rows, a list pushed below the fold, and a
// page payload that is too large to hydrate quickly on a phone.

test.beforeEach(async ({ page }) => {
	await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
});

const phoneWidths = [320, 390, 430];

for (const width of phoneWidths) {
	test(`${width}px: toolbar is one row, nothing overflows, list is above the fold`, async ({ page }, info) => {
		test.skip(!/Mobile Chrome|iPhone WebKit/.test(info.project.name));
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/');
		await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });

		// The page itself never scrolls sideways.
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

		// Every toolbar control sits on the same row (distinct tops differ by < 4px).
		const tops = await page.locator('.filter-row button:visible, .filter-row select:visible').evaluateAll(
			(els) => els
				.filter((el) => !el.classList.contains('mobile-map-trigger'))
				.map((el) => Math.round(el.getBoundingClientRect().top))
		);
		expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4);

		// At least two complete result cards are visible without scrolling.
		const fold = 844;
		const visibleRows = await page.locator('.row').evaluateAll(
			(rows, foldPx) => rows.filter((row) => row.getBoundingClientRect().bottom <= (foldPx as number)).length,
			fold
		);
		expect(visibleRows).toBeGreaterThanOrEqual(2);

		await page.screenshot({ scale: 'css', path: info.outputPath(`layout-${width}.png`) });
	});

	test(`${width}px: Near me keeps the toolbar on one row and Map is labeled`, async ({ page, context }, info) => {
		test.skip(!/Mobile Chrome|iPhone WebKit/.test(info.project.name));
		await context.grantPermissions(['geolocation']);
		await context.setGeolocation({ latitude: 33.6846, longitude: -117.8265 });
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/');
		await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });
		await page.getByRole('button', { name: 'Near me', exact: true }).click();
		await expect(page.locator('.radius-control')).toBeVisible({ timeout: 15_000 });
		const tops = await page.locator('.filter-row button:visible, .filter-row select:visible').evaluateAll(
			(els) => els
				.filter((el) => !el.classList.contains('mobile-map-trigger'))
				.map((el) => Math.round(el.getBoundingClientRect().top))
		);
		expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4);
		const map = page.getByRole('button', { name: 'Open map', exact: true });
		await expect(map).toBeVisible();
		await expect(map).toContainText('Map');
	});
}

test('sort row never clips its result count', async ({ page }, info) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(info.project.name));
	await page.setViewportSize({ width: 320, height: 844 });
	await page.goto('/');
	await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });
	const clipped = await page.evaluate(() => {
		const out: string[] = [];
		for (const el of document.querySelectorAll('.sort-bar, .sort-bar *')) {
			const r = el.getBoundingClientRect();
			if (r.width > 0 && r.right > window.innerWidth + 1) out.push(`${el.className}:${Math.round(r.right)}`);
		}
		return out;
	});
	expect(clipped).toEqual([]);
});

test('home page payload stays within the phone budget', async ({ request }) => {
	const response = await request.get('/');
	const html = await response.text();
	// Raw HTML (what the phone must parse), not the compressed transfer size. The dataset was
	// 2.4 MB before teasers were trimmed and rows were sent as compact tuples; the dev server
	// renders ~1.0 MB and production ~0.9 MB. Keep headroom for data growth, not for regressions.
	expect(Buffer.byteLength(html)).toBeLessThan(1.2 * 1024 * 1024);
});
