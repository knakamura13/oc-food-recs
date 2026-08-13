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
			attributionVisible: Boolean(
				attribution && attribution.getClientRects().length > 0
			),
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
			width: rect.width,
			vw: window.innerWidth,
			title: el.querySelector('.recency-title')?.textContent?.trim() ?? ''
		};
	});

	expect(box.left).toBeGreaterThanOrEqual(-1);
	expect(box.right).toBeLessThanOrEqual(box.vw + 1);
	expect(box.width).toBeLessThanOrEqual(box.vw - 16);
	expect(box.title).toBe('Comment recency');
});
