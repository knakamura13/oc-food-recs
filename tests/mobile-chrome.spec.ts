import { expect, test } from '@playwright/test';

test('390px chrome leaves room for restaurant results', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
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
		const attribution = document.querySelector('.attribution');
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
			attributionVisible: Boolean(attribution && attribution.getClientRects().length > 0),
			mapRight: Math.round(mapBox.right),
			vw: window.innerWidth
		};
	});

	expect(metrics.filterHeight).toBeLessThanOrEqual(56);
	expect(metrics.sortHeight).toBeLessThanOrEqual(64);
	expect(metrics.rowTop).toBeLessThanOrEqual(340);
	expect(metrics.shortcutVisible).toBe(false);
	expect(metrics.searchFontSize).toBeGreaterThanOrEqual(16);
	expect(metrics.attributionVisible).toBe(false);
	expect(metrics.mapRight).toBeLessThanOrEqual(metrics.vw + 1);
});

test('320px filter chips stay reachable without clipping City', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');

	await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });

	const metrics = await page.evaluate(() => {
		const controls = document.querySelector('.filter-controls');
		const city = [...document.querySelectorAll('.filter-controls .dropdown-trigger')].find(
			(el) => el.textContent?.trim().startsWith('City')
		);
		const recency = [...document.querySelectorAll('.filter-controls .dropdown-trigger')].find(
			(el) => el.textContent?.trim().startsWith('Recency')
		);
		const mapBtn = document.querySelector('.mobile-map-trigger');
		const count = document.querySelector('.result-count');
		if (!controls || !city || !recency || !mapBtn || !count) {
			throw new Error('Missing filter chrome');
		}
		const cityBox = city.getBoundingClientRect();
		const recencyBox = recency.getBoundingClientRect();
		const mapBox = mapBtn.getBoundingClientRect();
		const countBox = count.getBoundingClientRect();
		const controlsBox = controls.getBoundingClientRect();
		return {
			cityFullyVisible: cityBox.left >= controlsBox.left - 1 && cityBox.right <= controlsBox.right + 1,
			recencyPeeked: recencyBox.left < window.innerWidth - 8,
			overflowEnd: controls.classList.contains('overflow-end'),
			mapWidth: Math.round(mapBox.width),
			mapHeight: Math.round(mapBox.height),
			mapName: mapBtn.getAttribute('aria-label'),
			countRight: Math.round(countBox.right),
			vw: window.innerWidth
		};
	});

	expect(metrics.cityFullyVisible).toBe(true);
	expect(metrics.recencyPeeked).toBe(true);
	expect(metrics.overflowEnd).toBe(true);
	expect(metrics.mapWidth).toBeGreaterThanOrEqual(44);
	expect(metrics.mapHeight).toBeGreaterThanOrEqual(44);
	expect(metrics.mapName).toBe('Open map');
	expect(metrics.countRight).toBeLessThanOrEqual(metrics.vw + 1);
});

test('320px recency panel stays inside the viewport', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');

	const trigger = page.getByRole('button', { name: 'Recency', exact: true });
	await expect(trigger).toBeVisible({ timeout: 30_000 });
	const panel = page.locator('.recency-panel');
	await expect(async () => {
		if (await panel.isVisible()) return;
		await trigger.evaluate((el) => {
			el.scrollIntoView({ block: 'nearest', inline: 'center' });
		});
		await trigger.click();
		await expect(panel).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 20_000 });

	const box = await panel.evaluate((el) => {
		const rect = el.getBoundingClientRect();
		return {
			left: rect.left,
			right: rect.right,
			top: rect.top,
			bottom: rect.bottom,
			width: rect.width,
			vw: window.innerWidth,
			vh: window.innerHeight,
			title: el.querySelector('.recency-title')?.textContent?.trim() ?? ''
		};
	});

	expect(box.left).toBeGreaterThanOrEqual(-1);
	expect(box.right).toBeLessThanOrEqual(box.vw + 1);
	expect(box.top).toBeGreaterThanOrEqual(-1);
	expect(box.bottom).toBeLessThanOrEqual(box.vh + 1);
	expect(box.width).toBeLessThanOrEqual(box.vw - 16);
	expect(box.title).toBe('Comment recency');
});

test('320px recency Reset stays visible inside the clamped panel', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');

	const trigger = page.getByRole('button', { name: 'Recency', exact: true });
	await expect(trigger).toBeVisible({ timeout: 30_000 });
	const panel = page.locator('.recency-panel');
	await expect(async () => {
		if (await panel.isVisible()) return;
		await trigger.evaluate((el) => {
			el.scrollIntoView({ block: 'nearest', inline: 'center' });
		});
		await trigger.click();
		await expect(panel).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 20_000 });

	const metrics = await panel.evaluate((el) => {
		const reset = el.querySelector<HTMLElement>('.reset');
		const slider = el.querySelector<HTMLElement>('.slider');
		if (!reset || !slider) throw new Error('Missing recency controls');
		const panelBox = el.getBoundingClientRect();
		const resetBox = reset.getBoundingClientRect();
		const sliderBox = slider.getBoundingClientRect();
		const fullyIn = (inner: DOMRect, outer: DOMRect) =>
			inner.top >= outer.top - 1 &&
			inner.bottom <= outer.bottom + 1 &&
			inner.left >= outer.left - 1 &&
			inner.right <= outer.right + 1;
		return {
			resetInPanel: fullyIn(resetBox, panelBox),
			sliderInPanel: fullyIn(sliderBox, panelBox),
			resetInViewport:
				resetBox.top >= -1 &&
				resetBox.bottom <= window.innerHeight + 1 &&
				resetBox.left >= -1 &&
				resetBox.right <= window.innerWidth + 1,
			panelBottom: Math.round(panelBox.bottom),
			resetBottom: Math.round(resetBox.bottom),
			vh: window.innerHeight
		};
	});

	expect(metrics.sliderInPanel).toBe(true);
	expect(metrics.resetInPanel).toBe(true);
	expect(metrics.resetInViewport).toBe(true);
	expect(metrics.resetBottom).toBeLessThanOrEqual(metrics.vh + 1);
	expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.vh + 1);
});

test('320px cuisine list stays inside the viewport', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/');

	const trigger = page.getByRole('button', { name: 'Cuisine', exact: true });
	await expect(trigger).toBeVisible({ timeout: 30_000 });
	await trigger.click();
	const panel = page.locator('#cuisine-listbox');
	await expect(panel).toBeVisible();

	const box = await panel.evaluate((el) => {
		const rect = el.getBoundingClientRect();
		return {
			left: rect.left,
			right: rect.right,
			top: rect.top,
			bottom: rect.bottom,
			vw: window.innerWidth,
			vh: window.innerHeight
		};
	});

	expect(box.left).toBeGreaterThanOrEqual(-1);
	expect(box.right).toBeLessThanOrEqual(box.vw + 1);
	expect(box.top).toBeGreaterThanOrEqual(-1);
	expect(box.bottom).toBeLessThanOrEqual(box.vh + 1);
});

test('320px drawer actions stay visible above comments', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
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
		const buttons = [...actionRoot.querySelectorAll<HTMLElement>('button, a')].map((el) => {
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

test('desktop drawer keeps comments above conversion actions', async ({ page }, testInfo) => {
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
		const buttons = [...actionRoot.querySelectorAll<HTMLElement>('button, a')].map((el) =>
			Math.round(el.getBoundingClientRect().height)
		);
		return {
			commentsAboveActions: commentBox.bottom <= actionBox.top + 1,
			buttonHeights: buttons
		};
	});

	expect(order.commentsAboveActions).toBe(true);
	for (const height of order.buttonHeights) {
		expect(height).toBeLessThan(44);
	}
});
