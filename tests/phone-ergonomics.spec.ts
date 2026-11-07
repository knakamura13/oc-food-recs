import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	// QA interactions must not change live analytics or depend on geocode data.
	await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
});

for (const width of [320, 390]) {
	test(`${width}px toolbar keeps Saved in reach and every control a 44px touch target`, async ({ page }, info) => {
		test.skip(!/Mobile Chrome|iPhone WebKit/.test(info.project.name));
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/');
		await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });
		await page.locator('.row-save-btn').first().click();
		const saved = page.locator('.filter-row .saved-toggle');
		await expect(saved).toBeVisible();
		// Saved leads the row: it is on screen with no scrolling (issue #165, problem 1).
		const savedBox = (await saved.boundingBox())!;
		expect(savedBox.x).toBeGreaterThanOrEqual(0);
		expect(savedBox.x + savedBox.width).toBeLessThanOrEqual(width);
		expect(savedBox.height).toBeGreaterThanOrEqual(44);

		// Every other control is reachable by scrolling the row and is a full-size target.
		const controls = page.locator('.filter-row button:visible');
		const count = await controls.count();
		for (let i = 0; i < count; i++) {
			const button = controls.nth(i);
			await button.scrollIntoViewIfNeeded();
			const box = (await button.boundingBox())!;
			expect(box.x, `control ${i} left edge`).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width, `control ${i} right edge`).toBeLessThanOrEqual(width + 1);
			expect(box.height, `control ${i} height`).toBeGreaterThanOrEqual(44);
		}

		// The labeled Map button floats on screen at a full-size target.
		const mapBox = (await page.getByRole('button', { name: 'Open map', exact: true }).boundingBox())!;
		expect(mapBox.x).toBeGreaterThanOrEqual(0);
		expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(width);
		expect(mapBox.height).toBeGreaterThanOrEqual(44);

		const rail = page.locator('.filter-row');
		await rail.evaluate((el) => { el.scrollLeft = 0; });
		if (await rail.evaluate((el) => el.scrollWidth > el.clientWidth + 4)) {
			await expect(rail).toHaveClass(/overflow-end/);
			expect(await rail.evaluate((el) => getComputedStyle(el).maskImage)).toContain('linear-gradient');
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		await page.screenshot({ scale: 'css', path: info.outputPath(`phone-${width}.png`) });
		await page.goto('/?city=Santa%20Ana');
		for (const button of [page.getByRole('button', { name: 'Remove Santa Ana filter' }),
			page.getByRole('button', { name: 'Clear all', exact: true })]) {
			expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		}
	});
}

test('mobile map fills the viewport behind the sheet, keeps attribution visible and closes on Escape', async ({ page }, info) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(info.project.name));
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/?city=Santa%20Ana');
	await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Open map', exact: true }).click();
	const map = page.getByRole('dialog', { name: 'Restaurant map' });
	await expect(map).toBeVisible();
	const box = await map.boundingBox();
	expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
	await expect(map.getByRole('button', { name: 'Close map', exact: true })).toBeFocused();
	const attribution = map.getByRole('link', { name: 'OpenStreetMap contributors' });
	await expect(attribution).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
	// The sheet must not cover the attribution OpenStreetMap requires.
	await expect(attribution).toBeVisible();
	expect(await attribution.evaluate((el) => {
		const r = el.getBoundingClientRect();
		const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
		return hit === el || el.contains(hit);
	})).toBe(true);
	await page.screenshot({ scale: 'css', path: info.outputPath('phone-map.png') });
	await page.keyboard.press('Escape');
	await expect(map).toBeHidden();
	await expect(page.getByRole('button', { name: 'Open map', exact: true })).toBeFocused();
});

test('expanded mobile row keeps its collapse header available while reading', async ({ page }, info) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(info.project.name));
	await page.setViewportSize({ width: 390, height: 844 });
	// Supply a long primary comment so this tests reading, even with CI's small corpus.
	await page.route('**/api/r/*.json', (route) => route.fulfill({ json: [{
		comment_id: 'phone-reading-fixture', thread_id: 'orangecounty-e2e1',
		permalink: null, author: 'phone-fixture', score: 15,
		role: 'primary', classification: 'dish_rec', comment_date: '2024-06-01T12:00:00Z',
		body: 'A long restaurant recommendation for testing the reading experience. '.repeat(80)
	}] }));
	await page.goto('/');
	const row = page.locator('.row').first();
	await row.locator('.row-toggle').click();
	await expect(row).toHaveClass(/expanded/);
	expect(await row.locator('.row-header').evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
	await expect(row.locator('.primary-comment')).toBeVisible();
	const list = page.locator('.list-scroll');
	// Scroll the list directly: mouse.wheel is unavailable in mobile WebKit and this test is
	// about the sticky header, not the wheel.
	await list.evaluate((el) => el.scrollBy(0, 200));
	await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
	await expect.poll(() => row.locator('.row-header').evaluate(el => {
		const viewport = el.closest('.list-scroll')!.getBoundingClientRect();
		return Math.abs(el.getBoundingClientRect().top - viewport.top);
	})).toBeLessThanOrEqual(1);
	await row.locator('.row-toggle').click();
	await expect(row).not.toHaveClass(/expanded/);
});


test('cold filtered map fits a single restaurant and refits after reopening', async ({ page }, info) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(info.project.name));
	await page.goto('/?city=Santa%20Ana');
	await page.locator('.row-save-btn').first().click();
	await page.locator('.saved-toggle').click();
	await expect(page.locator('.row-name')).toHaveCount(1);
	await page.getByRole('button', { name: 'Open map', exact: true }).click();
	const highestZoom = () => page.locator('.leaflet-tile').evaluateAll(tiles => Math.max(...tiles.map(tile => {
		const match = (tile as HTMLImageElement).src.match(/\/(\d+)\/\d+\/\d+\.png$/);
		return match ? Number(match[1]) : 0;
	})));
	await expect.poll(highestZoom).toBe(14);
	await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
	await page.getByRole('dialog', { name: 'Restaurant map' }).getByRole('button', { name: 'Close map', exact: true }).click();
	await page.getByRole('button', { name: 'Open map', exact: true }).click();
	await expect.poll(highestZoom).toBe(14);
});
