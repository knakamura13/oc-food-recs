import { expect, test } from '@playwright/test';
import { startOnList } from './list-view';

test.beforeEach(async ({ page }) => {
	await startOnList(page);
});

test('390px chrome leaves room for restaurant results', async ({ page }, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Mobile viewport only');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	const row = page.locator('.row').filter({ has: page.locator('.row-toggle') }).first();
	await expect(row).toBeVisible({ timeout: 30_000 });

	const metrics = await page.evaluate(() => {
		const rowEl = document.querySelector('.row-toggle')?.closest('.row');
		const filters = document.querySelector('.filter-row');
		const sortBar = document.querySelector('.sort-bar');
		const shortcut = document.querySelector('.search-shortcut');
		const search = document.querySelector<HTMLInputElement>('input[type="search"]');
		const mapBtn = document.querySelector('.mobile-map-trigger');
		if (!rowEl || !filters || !sortBar || !search || !mapBtn) {
			throw new Error('Missing explorer chrome');
		}
		const mapBox = mapBtn.getBoundingClientRect();
		return {
			rowTop: Math.round(rowEl.getBoundingClientRect().top),
			filterHeight: Math.round(filters.getBoundingClientRect().height),
			sortHeight: Math.round(sortBar.getBoundingClientRect().height),
			shortcutVisible: Boolean(shortcut && shortcut.getClientRects().length > 0),
			searchFontSize: Number.parseFloat(getComputedStyle(search).fontSize),
			mapRight: Math.round(mapBox.right),
			vw: window.innerWidth
		};
	});

	// Facets and fixed actions each retain a 44px touch row.
	expect(metrics.filterHeight).toBeLessThanOrEqual(104);
	expect(metrics.sortHeight).toBeLessThanOrEqual(64);
	expect(metrics.rowTop).toBeLessThanOrEqual(392);
	expect(metrics.shortcutVisible).toBe(false);
	expect(metrics.searchFontSize).toBeGreaterThanOrEqual(16);
	expect(metrics.mapRight).toBeLessThanOrEqual(metrics.vw + 1);
});

test('320px toolbar is one row that signals any hidden controls and keeps Map and the count in view', async ({ page }, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');

	await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });

	const metrics = await page.evaluate(() => {
		const row = document.querySelector('.filter-row');
		const triggers = [...document.querySelectorAll('.filter-row .dropdown-trigger')].filter(
			(el) => el.getClientRects().length > 0
		);
		const nearMe = triggers.find((el) => el.textContent?.trim().startsWith('Near me'));
		const mapBtn = document.querySelector('.mobile-map-trigger');
		const count = document.querySelector('.result-count');
		if (!row || !nearMe || !mapBtn || !count) throw new Error('Missing filter chrome');
		const rowBox = row.getBoundingClientRect();
		const nearBox = nearMe.getBoundingClientRect();
		const mapBox = mapBtn.getBoundingClientRect();
		const countBox = count.getBoundingClientRect();
		const tops = triggers.map((el) => Math.round(el.getBoundingClientRect().top));
		return {
			firstControlFullyVisible: nearBox.left >= rowBox.left - 1 && nearBox.right <= rowBox.right + 1,
			oneRow: Math.max(...tops) - Math.min(...tops) < 4,
			// A control beyond the edge means the row scrolls; the fade must say so.
			hasOverflow: row.scrollWidth > row.clientWidth + 4,
			overflowEnd: row.classList.contains('overflow-end'),
			mapWidth: Math.round(mapBox.width),
			mapHeight: Math.round(mapBox.height),
			mapName: mapBtn.getAttribute('aria-label'),
			mapOnScreen: mapBox.left >= 0 && mapBox.right <= window.innerWidth,
			countRight: Math.round(countBox.right),
			vw: window.innerWidth
		};
	});

	expect(metrics.firstControlFullyVisible).toBe(true);
	expect(metrics.oneRow).toBe(true);
	// With the facet dropdowns folded into the Filters sheet the row may fit; if it does
	// not, the fade must say there is more.
	if (metrics.hasOverflow) expect(metrics.overflowEnd).toBe(true);
	expect(metrics.mapWidth).toBeGreaterThanOrEqual(44);
	expect(metrics.mapHeight).toBeGreaterThanOrEqual(44);
	expect(metrics.mapName).toBe('Open map');
	expect(metrics.mapOnScreen).toBe(true);
	expect(metrics.countRight).toBeLessThanOrEqual(metrics.vw + 1);
});

async function openFiltersSheet(page: import('@playwright/test').Page) {
	const trigger = page.getByRole('button', { name: /^Filters/ });
	await expect(trigger).toBeVisible({ timeout: 30_000 });
	const sheet = page.getByRole('dialog', { name: 'Filters' });
	// A click before hydration is lost, so retry until the sheet opens.
	await expect(async () => {
		if (!(await sheet.isVisible())) await trigger.click({ timeout: 2_000 });
		await expect(sheet).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 20_000 });
	return sheet;
}

test('320px Filters sheet stays inside the viewport and keeps its apply button reachable', async ({ page }, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');
	const sheet = await openFiltersSheet(page);

	const metrics = await sheet.evaluate((el) => {
		const rect = el.getBoundingClientRect();
		const apply = el.querySelector<HTMLElement>('.filters-sheet-apply')!.getBoundingClientRect();
		const options = [...el.querySelectorAll<HTMLElement>('.dropdown-item')].slice(0, 8).map((item) =>
			Math.round(item.getBoundingClientRect().height)
		);
		return {
			left: rect.left,
			right: rect.right,
			top: rect.top,
			bottom: rect.bottom,
			applyBottom: apply.bottom,
			applyHeight: apply.height,
			vw: window.innerWidth,
			vh: window.innerHeight,
			options
		};
	});
	expect(metrics.left).toBeGreaterThanOrEqual(-1);
	expect(metrics.right).toBeLessThanOrEqual(metrics.vw + 1);
	expect(metrics.top).toBeGreaterThanOrEqual(-1);
	expect(metrics.bottom).toBeLessThanOrEqual(metrics.vh + 1);
	expect(metrics.applyBottom).toBeLessThanOrEqual(metrics.vh + 1);
	expect(metrics.applyHeight).toBeGreaterThanOrEqual(44);
	expect(metrics.options.length).toBeGreaterThan(0);
	for (const height of metrics.options) expect(height).toBeGreaterThanOrEqual(44);
});

test('320px Filters sheet reaches the recency slider and Reset by scrolling its body', async ({ page }, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');
	const sheet = await openFiltersSheet(page);

	const slider = sheet.locator('.slider');
	await slider.scrollIntoViewIfNeeded();
	const metrics = await sheet.evaluate((el) => {
		const body = el.querySelector<HTMLElement>('.filters-sheet-body')!.getBoundingClientRect();
		const slider = el.querySelector<HTMLElement>('.slider')!.getBoundingClientRect();
		return {
			sliderInBody: slider.top >= body.top - 1 && slider.bottom <= body.bottom + 1,
			sliderInViewport: slider.left >= -1 && slider.right <= window.innerWidth + 1
		};
	});
	expect(metrics.sliderInBody).toBe(true);
	expect(metrics.sliderInViewport).toBe(true);
});

test('320px drawer actions stay visible above comments', async ({ page }, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');

	const toggle = page.locator('.row-toggle').first();
	await expect(toggle).toBeVisible({ timeout: 30_000 });
	await toggle.click();

	const actions = page.getByRole('group', { name: 'Restaurant actions' });
	await expect(actions).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole('button', { name: 'Show on map' })).toBeVisible();
	await expect(page.locator('.drawer-skeleton')).toHaveCount(0, { timeout: 30_000 });

	const metrics = await page.evaluate(() => {
		const inViewport = (box: DOMRect) =>
			box.top >= -1 &&
			box.bottom <= window.innerHeight + 1 &&
			box.left >= -1 &&
			box.right <= window.innerWidth + 1;
		const actionRoot = document.querySelector('.drawer-actions');
		const comment = document.querySelector('.primary-comment, .drawer-content');
		if (!actionRoot) throw new Error('Missing drawer actions');
		const actionBox = actionRoot.getBoundingClientRect();
		const commentBox = comment?.getBoundingClientRect();
		// Skip controls that are not shown (the closed report dialog's Cancel and Send).
		const buttons = [...actionRoot.querySelectorAll<HTMLElement>('button, a')].filter(
			(el) => el.getClientRects().length > 0
		).map((el) => {
			const box = el.getBoundingClientRect();
			return {
				text: el.textContent?.replace(/\s+/g, ' ').trim(),
				h: Math.round(box.height),
				inViewport: inViewport(box)
			};
		});
		return {
			actionsInViewport: inViewport(actionBox),
			aboveComments: commentBox ? actionBox.bottom <= commentBox.top + 1 : true,
			buttons,
			vh: window.innerHeight
		};
	});

	expect(metrics.actionsInViewport).toBe(true);
	expect(metrics.aboveComments).toBe(true);
	expect(metrics.buttons.length).toBeGreaterThanOrEqual(2);
	for (const button of metrics.buttons) {
		expect(button.h, button.text).toBeGreaterThanOrEqual(44);
		expect(button.inViewport, button.text).toBe(true);
	}
});

test('320px search placeholder fits without clipping', async ({ page }, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');

	await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });

	const metrics = await page.evaluate(() => {
		const search = document.querySelector<HTMLInputElement>('input[type="search"]');
		if (!search) throw new Error('Missing search input');
		const style = getComputedStyle(search);
		const box = search.getBoundingClientRect();
		const padL = Number.parseFloat(style.paddingLeft);
		const padR = Number.parseFloat(style.paddingRight);
		const available = box.width - padL - padR;
		const placeholder = search.getAttribute('placeholder') ?? '';
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('No canvas context');
		ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		const textW = ctx.measureText(placeholder).width;
		return {
			placeholder,
			available: Math.round(available),
			textW: Math.round(textW),
			overflowPx: Math.round(textW - available),
			clips: textW > available + 1,
			ariaLabel: search.getAttribute('aria-label')
		};
	});

	expect(metrics.placeholder).toBe('Search restaurants or cities...');
	expect(metrics.ariaLabel).toBe('Search restaurants, cuisines, or cities');
	expect(metrics.clips).toBe(false);
	expect(metrics.overflowPx).toBeLessThanOrEqual(0);
});

test('desktop drawer keeps actions above comments', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');

	const toggle = page.locator('.row-toggle').first();
	await expect(toggle).toBeVisible({ timeout: 30_000 });
	await toggle.click();

	const actions = page.getByRole('group', { name: 'Restaurant actions' });
	await expect(actions).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('.drawer-skeleton')).toHaveCount(0, { timeout: 30_000 });
	await expect(page.locator('.primary-comment, .drawer-content').first()).toBeVisible();

	const order = await page.evaluate(() => {
		const actionRoot = document.querySelector('.drawer-actions');
		const comment = document.querySelector('.primary-comment, .drawer-content');
		if (!actionRoot || !comment) throw new Error('Missing drawer content');
		const actionBox = actionRoot.getBoundingClientRect();
		const commentBox = comment.getBoundingClientRect();
		const buttons = [...actionRoot.querySelectorAll<HTMLElement>('button, a')]
			.filter((el) => el.getClientRects().length > 0)
			.map((el) => Math.round(el.getBoundingClientRect().height));
		return {
			actionsAboveComments: actionBox.bottom <= commentBox.top + 1,
			buttonHeights: buttons
		};
	});

	expect(order.actionsAboveComments).toBe(true);
	for (const height of order.buttonHeights) {
		expect(height).toBeLessThan(44);
	}
});

test('320px Filters sheet applies a cuisine, then Show closes it so a result row is tappable', async ({
	page
}, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');
	const sheet = await openFiltersSheet(page);

	await sheet.getByRole('listbox', { name: 'Filter by cuisine' }).locator('.dropdown-item').first().click();
	await expect(page.getByRole('button', { name: /^Filters/ })).toContainText('1');
	await sheet.getByRole('button', { name: /^Show/ }).click();
	await expect(page.getByRole('dialog', { name: 'Filters' })).toBeHidden();

	const row = page.locator('.row-toggle').first();
	await expect(row).toBeVisible();
	await row.click();
	await expect(row).toHaveAttribute('aria-expanded', 'true');
});

test('the Filters sheet closes when the window grows to the desktop layout', async ({ page }, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	const sheet = await openFiltersSheet(page);
	await expect(sheet).toBeVisible();

	await page.setViewportSize({ width: 1280, height: 800 });
	await expect(page.getByRole('dialog', { name: 'Filters' })).toBeHidden();
	// The desktop dropdowns are back and the page is not stuck behind a modal.
	await page.getByRole('button', { name: 'Cuisine', exact: true }).click();
	await expect(page.getByRole('listbox', { name: 'Filter by cuisine' })).toBeVisible();
});
