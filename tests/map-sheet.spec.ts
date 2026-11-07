import { expect, test, type Page } from '@playwright/test';

// Phones: the open map sits behind a list sheet that snaps between peek, half and full.
test.beforeEach(({}, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Phone viewport only');
});

async function openMap(page: Page, size = { width: 390, height: 844 }) {
	await page.setViewportSize(size);
	await page.goto('/');
	await expect(page.locator('.row[id^="restaurant-"]').first()).toBeVisible({ timeout: 30_000 });
	const sheet = page.locator('.list-pane.sheet');
	// A click before hydration is lost, so retry until the map opens.
	await expect(async () => {
		if ((await sheet.count()) === 0) await page.getByRole('button', { name: 'Open map', exact: true }).click({ timeout: 2_000 });
		await expect(sheet).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 30_000 });
	await expect(page.locator('.map-close-btn')).toBeFocused();
}

const sheetHeight = (page: Page) =>
	page.locator('.list-pane.sheet').evaluate((el) => Math.round(el.getBoundingClientRect().height));

/** Height once the 250ms snap transition has finished. */
async function settledSheetHeight(page: Page) {
	let last = await sheetHeight(page);
	for (let i = 0; i < 20; i += 1) {
		await page.waitForTimeout(120);
		const next = await sheetHeight(page);
		if (next === last) return next;
		last = next;
	}
	return last;
}

async function centerHit(page: Page, selector: string) {
	return page.locator(selector).first().evaluate((el) => {
		const r = el.getBoundingClientRect();
		const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
		return { visible: r.width > 0 && r.height > 0, reachable: hit === el || el.contains(hit) };
	});
}

test('grabber cycles peek, half and full, then back to peek', async ({ page }) => {
	await openMap(page);
	const grabber = page.locator('.sheet-grabber');
	await expect(grabber).toHaveAccessibleName('Expand list');
	const peek = await sheetHeight(page);

	await grabber.click();
	await expect.poll(() => sheetHeight(page)).toBeGreaterThan(peek + 100);
	const half = await sheetHeight(page);
	await expect(grabber).toHaveAttribute('aria-expanded', 'true');

	await grabber.click();
	await expect.poll(() => sheetHeight(page)).toBeGreaterThan(half + 100);
	await expect(grabber).toHaveAccessibleName('Collapse list');

	await grabber.click();
	await expect.poll(() => sheetHeight(page)).toBe(peek);
	await expect(grabber).toHaveAccessibleName('Expand list');
});

test('arrow keys step the sheet and stop at both ends', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name === 'iPhone WebKit', 'WebKit does not focus buttons by default');
	await openMap(page);
	const grabber = page.locator('.sheet-grabber');
	await grabber.focus();
	const peek = await sheetHeight(page);

	await page.keyboard.press('ArrowUp');
	await expect.poll(() => sheetHeight(page)).toBeGreaterThan(peek + 100);
	await page.keyboard.press('ArrowUp');
	await expect(grabber).toHaveAccessibleName('Collapse list');
	const full = await settledSheetHeight(page);
	await page.keyboard.press('ArrowUp');
	expect(await settledSheetHeight(page)).toBe(full);

	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	expect(await settledSheetHeight(page)).toBe(peek);
	await page.keyboard.press('ArrowDown');
	expect(await settledSheetHeight(page)).toBe(peek);
});

test('dragging the grabber follows the pointer and snaps', async ({ page }) => {
	await openMap(page);
	const peek = await sheetHeight(page);
	const box = (await page.locator('.sheet-grabber').boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;

	// Up by 170px in slow steps (no fling) from peek lands on half.
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= 10; i += 1) {
		await page.mouse.move(x, y - i * 17);
		await page.waitForTimeout(30);
	}
	const mid = await sheetHeight(page);
	expect(mid).toBeGreaterThan(peek + 100);
	await page.mouse.up();
	await expect(page.locator('.list-pane.sheet')).not.toHaveClass(/sheet-dragging/);
	await expect(page.locator('.sheet-grabber')).toHaveAttribute('aria-expanded', 'true');
	const half = await sheetHeight(page);
	expect(half).toBeGreaterThan(peek + 100);

	// A long drag down from half returns to peek.
	const box2 = (await page.locator('.sheet-grabber').boundingBox())!;
	const x2 = box2.x + box2.width / 2;
	const y2 = box2.y + box2.height / 2;
	await page.mouse.move(x2, y2);
	await page.mouse.down();
	for (let i = 1; i <= 10; i += 1) {
		await page.mouse.move(x2, y2 + i * 30);
		await page.waitForTimeout(30);
	}
	await page.mouse.up();
	await expect.poll(() => sheetHeight(page)).toBe(peek);
});

test('a fast drag that comes to rest before release snaps to the nearest stop, not a fling', async ({ page }) => {
	await openMap(page);
	const peek = await sheetHeight(page);
	await page.locator('.sheet-grabber').click();
	const half = await settledSheetHeight(page);
	await page.locator('.sheet-grabber').click();
	const full = await settledSheetHeight(page);
	await page.locator('.sheet-grabber').click();
	await expect.poll(() => sheetHeight(page)).toBe(peek);

	const box = (await page.locator('.sheet-grabber').boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	// Quick moves to just past half, then hold still before letting go.
	await page.mouse.move(x, y - (half - peek) - 10, { steps: 4 });
	await page.waitForTimeout(300);
	await page.mouse.up();
	await expect(page.locator('.list-pane.sheet')).not.toHaveClass(/sheet-dragging/);
	expect(await settledSheetHeight(page)).toBe(half);
	expect(half).toBeLessThan(full);
});

test('peek does not scroll the list, half and full do', async ({ page }) => {
	await openMap(page);
	const scroller = page.locator('.list-pane.sheet .list-scroll');
	await expect(scroller).toHaveCSS('overflow-y', 'hidden');
	await page.locator('.sheet-grabber').click();
	await expect(scroller).toHaveCSS('overflow-y', 'auto');
});

for (const size of [
	{ width: 320, height: 568 },
	{ width: 390, height: 844 },
	{ width: 430, height: 932 }
]) {
	test(`at full height the map chrome stays reachable at ${size.width}x${size.height}`, async ({ page }) => {
		await openMap(page, size);
		await page.locator('.sheet-grabber').click();
		await page.locator('.sheet-grabber').click();
		await expect(page.locator('.sheet-grabber')).toHaveAccessibleName('Collapse list');
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
		await page.waitForTimeout(400); // let the height transition finish

		const chips = await page.locator('.controls-bar').evaluate((el) => el.getBoundingClientRect().bottom);
		const sheetTop = await page.locator('.list-pane.sheet').evaluate((el) => el.getBoundingClientRect().top);
		expect(sheetTop).toBeGreaterThanOrEqual(chips);

		for (const selector of [
			'.map-close-btn',
			'.leaflet-control-zoom-in',
			'.locate-me-btn',
			'.leaflet-control-attribution a'
		]) {
			const { visible, reachable } = await centerHit(page, selector);
			expect(visible, `${selector} is rendered`).toBe(true);
			expect(reachable, `${selector} is not covered`).toBe(true);
		}
	});
}

test('tapping a pin lifts a collapsed sheet to half', async ({ page }) => {
	await openMap(page);
	await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 30_000 });
	const peek = await sheetHeight(page);
	await page.locator('.leaflet-marker-icon').first().click({ force: true });
	await expect.poll(() => sheetHeight(page)).toBeGreaterThan(peek + 100);
});

/** True when the element's center is not under the list sheet or the floating chips. */
async function uncovered(page: Page, selector: string) {
	return page.locator(selector).first().evaluate((el) => {
		const r = el.getBoundingClientRect();
		const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
		return r.height > 0 && Boolean(hit) && !hit!.closest('.list-pane, .controls-bar');
	});
}

for (const entry of ['row', 'Show on map'] as const) {
	test(`focusing a restaurant from the ${entry} keeps its pin above the sheet, short of max zoom`, async ({ page }) => {
		if (entry === 'row') {
			await openMap(page);
			await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 30_000 });
			await page.locator('.sheet-grabber').click();
			await page.locator('.list-pane.sheet .row-toggle').first().click();
		} else {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/');
			const row = page.locator('.row-toggle').first();
			await expect(row).toBeVisible({ timeout: 30_000 });
			// A click before hydration is lost, so retry until the row opens.
			const showOnMap = page.getByRole('button', { name: 'Show on map' }).first();
			await expect(async () => {
				if (!(await showOnMap.isVisible())) await row.click({ timeout: 2_000 });
				await expect(showOnMap).toBeVisible({ timeout: 2_000 });
			}).toPass({ timeout: 30_000 });
			await showOnMap.click();
		}
		await expect(page.locator('.rec-marker.is-active')).toBeVisible({ timeout: 30_000 });
		await expect.poll(() => uncovered(page, '.rec-marker.is-active'), { timeout: 10_000 }).toBe(true);
		await expect.poll(() => uncovered(page, '.rec-tooltip'), { timeout: 10_000 }).toBe(true);
		// At max zoom the list (which follows the map) shrank to the one place; Leaflet
		// disables zoom-in only there.
		await expect(page.locator('.leaflet-control-zoom-in')).not.toHaveClass(/leaflet-disabled/);
	});
}

test('Escape closes the map from the sheet and restores the Map button', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name === 'iPhone WebKit', 'WebKit does not focus buttons by default');
	await openMap(page);
	await page.locator('.sheet-grabber').focus();
	await page.keyboard.press('Escape');
	await expect(page.locator('.list-pane.sheet')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Open map', exact: true })).toBeFocused();
});

test('Tab out of the open sheet never lands on page content hidden behind the map', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name === 'iPhone WebKit', 'WebKit does not Tab to buttons by default');
	await openMap(page);
	await page.evaluate(() => {
		const focusable = [...document.querySelectorAll<HTMLElement>('.list-pane a[href], .list-pane button')]
			.filter((el) => el.getClientRects().length > 0);
		focusable[focusable.length - 1].focus();
	});
	for (let i = 0; i < 3; i += 1) {
		await page.keyboard.press('Tab');
		const behindMap = await page.evaluate(() => Boolean(document.activeElement?.closest('.site-footer, .hero-section')));
		expect(behindMap).toBe(false);
	}
});

test('filter chips stay usable above the open map', async ({ page }) => {
	await openMap(page);
	const box = (await page.locator('.controls-bar').boundingBox())!;
	expect(box.y).toBeLessThan(10);
	const nearMe = page.getByRole('button', { name: 'Near me' });
	await expect(nearMe).toBeVisible();
	const hit = await nearMe.evaluate((el) => {
		const r = el.getBoundingClientRect();
		const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
		return top === el || el.contains(top);
	});
	expect(hit).toBe(true);
});

test('the list follows the visible map area and recovers when the map closes', async ({ page }) => {
	await openMap(page);
	await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
	const summary = page.locator('.sheet-summary');
	await expect(summary).toContainText('in this area');
	// The map fits itself to the results shortly after opening; drag only once that has settled.
	await page.waitForTimeout(1200);
	const before = Number((await summary.innerText()).match(/[\d,]+/)![0].replace(/,/g, ''));
	expect(before).toBeGreaterThan(0);

	// Drag the map until nothing is in view; no button is involved.
	const box = (await page.locator('.leaflet-container').boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + 220;
	for (let i = 0; i < 4; i += 1) {
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 150, y + 40, { steps: 6 });
		await page.mouse.up();
		await page.waitForTimeout(250); // let Leaflet's drag inertia settle
	}
	await expect(summary).toHaveText(/^\s*0 places in this area/, { timeout: 10_000 });
	await page.locator('.sheet-grabber').click();
	await expect(page.getByText('Nothing in this map area')).toBeVisible();

	await page.locator('.map-close-btn').click();
	await expect(page.locator('.sheet-summary')).toHaveCount(0);
	await expect(page.locator('.row[id^="restaurant-"]').first()).toBeVisible();
});

test('there is no Search this area button', async ({ page }) => {
	await openMap(page);
	await expect(page.getByRole('button', { name: /search this area/i })).toHaveCount(0);
});
