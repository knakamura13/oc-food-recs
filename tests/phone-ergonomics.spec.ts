import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	// QA interactions must not change live analytics or depend on geocode data.
	await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
});

for (const width of [320, 390]) {
	test(`${width}px fixed actions and active filters have reachable touch targets`, async ({ page }, info) => {
		test.skip(info.project.name !== 'Mobile Chrome');
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/');
		await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });
		await page.locator('.row-save-btn').first().click();
		const saved = page.locator('.filter-actions .saved-toggle');
		const unmapped = page.locator('.filter-actions .unmapped-toggle');
		await expect(saved).toBeVisible();
		// The fixture corpus may have no unmapped rows, so its optional action is tested in Vitest.
		for (const button of [saved, ...(await unmapped.count() ? [unmapped] : []),
			page.getByRole('button', { name: 'Open map', exact: true }),
			page.getByRole('button', { name: 'Share view', exact: true })]) {
			const box = await button.boundingBox();
			expect(box).not.toBeNull();
			expect(box!.x).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width).toBeLessThanOrEqual(width);
			expect(box!.height).toBeGreaterThanOrEqual(44);
		}
		const rail = page.locator('.filter-controls');
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

test('mobile map occupies the viewport and retains modal focus and Escape', async ({ page }, info) => {
	test.skip(info.project.name !== 'Mobile Chrome');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/?city=Santa%20Ana');
	await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Open map', exact: true }).click();
	const map = page.getByRole('dialog', { name: 'Restaurant map' });
	await expect(map).toBeVisible();
	const box = await map.boundingBox();
	expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
	await expect(map.getByRole('button', { name: 'Close map', exact: true })).toBeFocused();
	expect(await map.evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
	await expect(map.getByRole('link', { name: 'OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
	await page.screenshot({ scale: 'css', path: info.outputPath('phone-map.png') });
	await page.keyboard.press('Escape');
	await expect(map).toBeHidden();
	await expect(page.getByRole('button', { name: 'Open map', exact: true })).toBeFocused();
});

test('expanded mobile row keeps its collapse header available while reading', async ({ page }, info) => {
	test.skip(info.project.name !== 'Mobile Chrome');
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
	const listBox = await list.boundingBox();
	await page.mouse.move(listBox!.x + listBox!.width / 2, listBox!.y + listBox!.height - 20);
	await page.mouse.wheel(0, 200);
	await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
	await expect.poll(() => row.locator('.row-header').evaluate(el => {
		const viewport = el.closest('.list-scroll')!.getBoundingClientRect();
		return Math.abs(el.getBoundingClientRect().top - viewport.top);
	})).toBeLessThanOrEqual(1);
	await row.locator('.row-toggle').click();
	await expect(row).not.toHaveClass(/expanded/);
});


test('cold filtered map fits a single restaurant and refits after reopening', async ({ page }, info) => {
	test.skip(info.project.name !== 'Mobile Chrome');
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
