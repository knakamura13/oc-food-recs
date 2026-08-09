import { expect, test, type Locator, type Page } from '@playwright/test';

async function firstRecommendationRow(page: Page): Promise<Locator> {
	const row = page.locator('.row').filter({ has: page.locator('.dish-teaser') }).first();
	await expect(row).toBeVisible({ timeout: 30_000 });
	return row;
}

async function readGeometry(row: Locator) {
	return row.evaluate((element) => {
		const box = (selector: string) => {
			const target = element.querySelector<HTMLElement>(selector);
			if (!target) throw new Error(`Missing ${selector}`);
			const rect = target.getBoundingClientRect();
			return {
				width: rect.width,
				height: rect.height,
				x: rect.x,
				y: rect.y,
				centerY: rect.y + rect.height / 2
			};
		};
		const teaser = element.querySelector<HTMLElement>('.dish-teaser');
		if (!teaser) throw new Error('Missing teaser');
		return {
			row: box('.row-header'),
			content: box('.row-toggle'),
			teaser: box('.dish-teaser'),
			stats: box('.row-stats'),
			bookmark: box('.row-save-btn'),
			chevron: box('.row-chevron-btn'),
			teaserLineHeight: Number.parseFloat(getComputedStyle(teaser).lineHeight)
		};
	});
}

async function readFollowingRowGap(row: Locator) {
	return row.evaluate((element) => {
		const virtualRow = element.closest<HTMLElement>('.virtual-row');
		if (!virtualRow) throw new Error('Missing virtual row');
		const index = Number(virtualRow.dataset.index);
		const followingRow = document.querySelector<HTMLElement>(`.virtual-row[data-index="${index + 1}"]`);
		if (!followingRow) throw new Error('Missing following virtual row');
		return followingRow.getBoundingClientRect().top - virtualRow.getBoundingClientRect().bottom;
	});
}

test('390px results prioritize restaurant content and keep full-size controls', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	const geometry = await readGeometry(await firstRecommendationRow(page));
	expect(geometry.content.width).toBeGreaterThanOrEqual(280);
	expect(geometry.teaser.width).toBeGreaterThanOrEqual(280);
	expect(geometry.teaser.height / geometry.teaserLineHeight).toBeLessThanOrEqual(2.1);
	expect(geometry.bookmark.width).toBeGreaterThanOrEqual(44);
	expect(geometry.bookmark.height).toBeGreaterThanOrEqual(44);
	expect(geometry.chevron.width).toBeGreaterThanOrEqual(44);
	expect(geometry.chevron.height).toBeGreaterThanOrEqual(44);
	expect(geometry.row.height).toBeLessThanOrEqual(170);
});

test('600px results retain compact horizontal density with full-size controls', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
	await page.setViewportSize({ width: 600, height: 900 });
	await page.goto('/');

	const geometry = await readGeometry(await firstRecommendationRow(page));
	expect(geometry.teaser.height / geometry.teaserLineHeight).toBeLessThanOrEqual(2.1);
	expect(geometry.bookmark.width).toBeGreaterThanOrEqual(44);
	expect(geometry.bookmark.height).toBeGreaterThanOrEqual(44);
	expect(geometry.chevron.width).toBeGreaterThanOrEqual(44);
	expect(geometry.chevron.height).toBeGreaterThanOrEqual(44);
	expect(Math.abs(geometry.content.centerY - geometry.stats.centerY)).toBeLessThanOrEqual(2);
	expect(geometry.row.height).toBeLessThanOrEqual(110);
});

test('desktop results keep the existing horizontal alignment', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop viewport only');
	await page.goto('/');

	const geometry = await readGeometry(await firstRecommendationRow(page));
	expect(Math.abs(geometry.content.centerY - geometry.stats.centerY)).toBeLessThanOrEqual(2);
	expect(geometry.row.height).toBeLessThanOrEqual(110);
});

test('mobile expansion keeps measured virtual rows from overlapping', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	const row = await firstRecommendationRow(page);
	await row.locator('.row-toggle').click();
	await expect(row).toHaveClass(/expanded/);
	await expect.poll(() => readFollowingRowGap(row)).toBeGreaterThanOrEqual(-1);

	const saveButton = row.getByRole('button', { name: /save .* to your list/i });
	await saveButton.click();
	await expect(row).toHaveClass(/expanded/);

	await row.locator('.row-toggle').click();
	await expect(row).not.toHaveClass(/expanded/);
	await expect.poll(() => readFollowingRowGap(row)).toBeGreaterThanOrEqual(-1);
});
