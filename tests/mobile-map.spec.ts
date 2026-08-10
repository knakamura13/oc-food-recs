import { expect, test, type Locator, type Page } from '@playwright/test';

const mobileViewports = [
	{ width: 320, height: 700 },
	{ width: 390, height: 844 },
	{ width: 600, height: 900 },
	{ width: 768, height: 1024 }
] as const;

const desktopViewports = [
	{ width: 1024, height: 768 },
	{ width: 1280, height: 800 }
] as const;

async function firstRenderedRow(page: Page): Promise<Locator> {
	const row = page.locator('.row').first();
	await expect(row).toBeVisible({ timeout: 30_000 });
	return row;
}

async function openRenderedRowWithMapAction(page: Page): Promise<Locator> {
	const rows = page.locator('.row');
	await firstRenderedRow(page);
	const rowCount = await rows.count();

	for (let index = 0; index < rowCount; index += 1) {
		const row = rows.nth(index);
		if (!(await row.isVisible())) continue;

		const rowToggle = row.locator('.row-toggle');
		await rowToggle.click();
		const showOnMap = row.getByRole('button', { name: 'Show on map' });
		const hasMapAction = await showOnMap
			.waitFor({ state: 'visible', timeout: 500 })
			.then(() => true, () => false);
		if (hasMapAction) return showOnMap;

		await rowToggle.click();
		await expect(rowToggle).toHaveAttribute('aria-expanded', 'false');
	}

	throw new Error('No rendered restaurant row with a map action was found');
}

async function expectVisibleRowActionsToBeHitTestable(page: Page) {
	const blockedActions = await page.locator('.row-save-btn, .row-chevron-btn').evaluateAll((actions) =>
		actions.flatMap((action) => {
			const rect = action.getBoundingClientRect();
			if (
				rect.width === 0 ||
				rect.height === 0 ||
				rect.bottom <= 0 ||
				rect.top >= window.innerHeight ||
				rect.right <= 0 ||
				rect.left >= window.innerWidth
			) {
				return [];
			}

			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			if (
				centerX < 0 ||
				centerX >= window.innerWidth ||
				centerY < 0 ||
				centerY >= window.innerHeight
			) {
				return [];
			}
			const hit = document.elementFromPoint(centerX, centerY);
			return action === hit || action.contains(hit)
				? []
				: [
						{
							className: action.className,
							hitClassName: hit instanceof HTMLElement ? hit.className : null,
							centerX,
							centerY
						}
					];
		})
	);

	expect(blockedActions).toEqual([]);
}

test.describe('Mobile map interaction', () => {
	test('disclosure opens an accessible sheet and Escape restores the opener', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await firstRenderedRow(page);

		const mapTrigger = page.locator('.mobile-map-trigger');
		const mapPane = page.locator('#restaurant-map-panel');
		const listPane = page.locator('.list-pane');

		await expect(mapTrigger).toBeVisible();
		await expect(mapTrigger).toHaveAccessibleName('Open map');
		await expect(mapTrigger).toHaveAttribute('aria-expanded', 'false');
		await expect(mapTrigger).toHaveAttribute('aria-controls', 'restaurant-map-panel');
		expect(await mapTrigger.evaluate((element) => element.tagName)).toBe('BUTTON');

		await expect(mapPane).toBeHidden();
		await expect(mapPane).not.toHaveAttribute('role', 'button');
		await expect(mapPane).not.toHaveAttribute('tabindex', '0');
		await expect(listPane).not.toHaveAttribute('inert', '');
		await expect(page.getByRole('application')).toHaveCount(0);
		await expect(
			mapPane.locator('a:visible, button:visible, [tabindex]:visible')
		).toHaveCount(0);

		await mapTrigger.focus();
		await page.keyboard.press('Enter');

		await expect(mapTrigger).toHaveAccessibleName('Close map');
		await expect(mapTrigger).toHaveAttribute('aria-expanded', 'true');
		await expect(mapPane).toBeVisible();
		await expect(mapPane).toHaveClass(/portal-expanded/);
		await expect(mapPane).toHaveAttribute('role', 'region');
		await expect(mapPane).toHaveAccessibleName('Restaurant map');
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('application')).toBeVisible();

		const closeButton = page.locator('.map-close-btn');
		await expect(closeButton).toBeFocused();
		await expect(listPane).toHaveAttribute('inert', '');
		await expect(page.locator('html')).toHaveClass(/mobile-map-expanded-lock/);

		const searchInput = page.getByRole('combobox', { name: /search restaurants/i });
		await expect(searchInput).toBeVisible();
		await expect(searchInput).toBeEnabled();
		await searchInput.fill('taco');
		await expect(searchInput).toHaveValue('taco');
		await searchInput.clear();

		await page.keyboard.press('Escape');

		await expect(mapPane).toBeHidden();
		await expect(mapTrigger).toHaveAccessibleName('Open map');
		await expect(mapTrigger).toHaveAttribute('aria-expanded', 'false');
		await expect(mapTrigger).toBeFocused();
		await expect(listPane).not.toHaveAttribute('inert', '');
		await expect(page.locator('html')).not.toHaveClass(/mobile-map-expanded-lock/);
		await expect(page.getByRole('application')).toHaveCount(0);
	});

	test('Show on map returns focus to the drawer action after the sheet closes', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');

		const showOnMap = await openRenderedRowWithMapAction(page);

		await showOnMap.focus();
		await showOnMap.click();

		const mapPane = page.locator('#restaurant-map-panel');
		const closeButton = page.locator('.map-close-btn');
		await expect(mapPane).toBeVisible();
		await expect(closeButton).toBeFocused();

		await closeButton.click();

		await expect(mapPane).toBeHidden();
		await expect(showOnMap).toBeFocused();
		await expect(page.locator('.list-pane')).not.toHaveAttribute('inert', '');
		await expect(page.locator('html')).not.toHaveClass(/mobile-map-expanded-lock/);
	});

	test('closed map never obstructs result actions across mobile widths', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');

		for (const viewport of mobileViewports) {
			await test.step(`${viewport.width}x${viewport.height}`, async () => {
				await page.setViewportSize(viewport);
				await page.goto('/');

				const row = await firstRenderedRow(page);
				const mapPane = page.locator('#restaurant-map-panel');
				const mapTrigger = page.locator('.mobile-map-trigger');

				await expect(mapTrigger).toBeVisible();
				await expect(mapTrigger).toHaveAccessibleName('Open map');
				await expect(mapPane).toBeHidden();
				await expect(page.getByRole('application')).toHaveCount(0);
				await expect(page.locator('.list-pane')).not.toHaveAttribute('inert', '');
				await expectVisibleRowActionsToBeHitTestable(page);

				const saveButton = row.locator('.row-save-btn');
				const initialSavedState = await saveButton.getAttribute('aria-pressed');
				await saveButton.click();
				await expect(saveButton).toHaveAttribute(
					'aria-pressed',
					initialSavedState === 'true' ? 'false' : 'true'
				);
				await saveButton.click();
				await expect(saveButton).toHaveAttribute('aria-pressed', initialSavedState ?? 'false');

				const rowToggle = row.locator('.row-toggle');
				await rowToggle.click();
				await expect(rowToggle).toHaveAttribute('aria-expanded', 'true');
				await expect(mapPane).toBeHidden();

				const overflow = await page.evaluate(() => ({
					document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
					body: document.body.scrollWidth - document.body.clientWidth
				}));
				expect(overflow.document).toBeLessThanOrEqual(0);
				expect(overflow.body).toBeLessThanOrEqual(0);
			});
		}
	});

	test('desktop keeps the inline map interactive without mobile semantics', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop viewport only');

		for (const viewport of desktopViewports) {
			await test.step(`${viewport.width}x${viewport.height}`, async () => {
				await page.setViewportSize(viewport);
				await page.goto('/');
				await firstRenderedRow(page);

				const mapPane = page.locator('#restaurant-map-panel');
				await expect(page.locator('.mobile-map-trigger')).toBeHidden();
				await expect(mapPane).toBeVisible();
				await expect(mapPane).not.toHaveAttribute('role', 'button');
				await expect(mapPane).not.toHaveAttribute('tabindex', '0');
				await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
				await expect(page.getByRole('application')).toBeVisible();

				const zoomIn = page.getByRole('button', { name: 'Zoom in' });
				await expect(zoomIn).toBeVisible();
				await expect(zoomIn).toBeEnabled();
				await zoomIn.click();

				await expect(page.locator('.list-pane')).not.toHaveAttribute('inert', '');
				await expect(page.locator('html')).not.toHaveClass(/mobile-map-expanded-lock/);
			});
		}
	});
});
