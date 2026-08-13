import {
	expect,
	test,
	type APIResponse,
	type Locator,
	type Page,
	type Route
} from '@playwright/test';

const leafletSourceMarker = 'A JavaScript library for interactive maps';
const javaScriptPattern = '**/*.js*';

type LeafletJavaScriptHandler = (
	route: Route,
	response: APIResponse,
	body: Buffer
) => Promise<void>;

async function interceptLeafletJavaScript(
	page: Page,
	handleLeaflet: LeafletJavaScriptHandler
): Promise<() => Promise<void>> {
	const handleJavaScript = async (route: Route) => {
		const response = await route.fetch();
		const body = await response.body();
		if (!body.includes(leafletSourceMarker)) {
			await route.fulfill({ response, body });
			return;
		}
		await handleLeaflet(route, response, body);
	};

	await page.route(javaScriptPattern, handleJavaScript);
	return () => page.unroute(javaScriptPattern, handleJavaScript);
}

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
	const row = page.locator('.row[id^="restaurant-"]').first();
	await expect(row).toBeVisible({ timeout: 30_000 });
	return row;
}

async function openRenderedRowWithMapAction(page: Page): Promise<string> {
	const rows = page.locator('.row[id^="restaurant-"]');
	await firstRenderedRow(page);
	const rowCount = await rows.count();

	for (let index = 0; index < rowCount; index += 1) {
		const positionalRow = rows.nth(index);
		if (!(await positionalRow.isVisible())) continue;
		const rowId = await positionalRow.getAttribute('id');
		if (!rowId) throw new Error('Rendered restaurant row is missing its stable ID');

		const stableRow = page.locator(`#${rowId}`);
		const rowToggle = stableRow.locator('.row-toggle');
		await rowToggle.click();
		await expect(rowToggle).toHaveAttribute('aria-expanded', 'true');
		const showOnMap = stableRow.getByRole('button', { name: 'Show on map' });
		if ((await showOnMap.count()) > 0) {
			await expect(stableRow.locator('.drawer-skeleton')).toHaveCount(0, {
				timeout: 30_000
			});
			await expect(page.locator(`#${rowId}`)).toBeVisible();
			await expect(
				page.locator(`#${rowId}`).getByRole('button', { name: 'Show on map' })
			).toBeVisible();
			return rowId;
		}

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

async function highestRenderedTileZoom(page: Page): Promise<number> {
	await expect(page.locator('.leaflet-tile').first()).toBeAttached({ timeout: 30_000 });
	const zooms = await page.locator('.leaflet-tile').evaluateAll((tiles) =>
		tiles.flatMap((tile) => {
			if (!(tile instanceof HTMLImageElement)) return [];
			const match = new URL(tile.src).pathname.match(/\/(\d+)\/\d+\/\d+\.png$/);
			return match ? [Number(match[1])] : [];
		})
	);
	if (zooms.length === 0) throw new Error('Leaflet rendered no identifiable map tiles');
	return Math.max(...zooms);
}

async function wheelMapAndReadZoom(page: Page): Promise<{ before: number; after: number }> {
	const map = page.locator('.map-container');
	const box = await map.boundingBox();
	if (!box) throw new Error('Map must be visible before using the wheel');
	const before = await highestRenderedTileZoom(page);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -720);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				// Leaflet debounces the wheel for 40ms, then runs its zoom animation.
				setTimeout(resolve, 450);
			})
	);
	return { before, after: await highestRenderedTileZoom(page) };
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
		expect(await mapPane.evaluate((element) => element.tagName)).toBe('DIALOG');
		await expect(mapPane).toHaveJSProperty('open', true);
		expect(
			await mapPane.evaluate((element) => element instanceof HTMLDialogElement && element.matches(':modal'))
		).toBe(true);
		await expect(page.getByRole('dialog', { name: 'Restaurant map' })).toBeVisible();
		await expect(mapPane).toHaveAttribute('aria-modal', 'true');
		await expect(mapPane).toHaveAccessibleName('Restaurant map');
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('application')).toBeVisible();

		const zoomInBox = await page.getByRole('button', { name: 'Zoom in' }).boundingBox();
		const zoomOutBox = await page.getByRole('button', { name: 'Zoom out' }).boundingBox();
		expect(zoomInBox).toBeTruthy();
		expect(zoomOutBox).toBeTruthy();
		expect(zoomInBox!.width).toBeGreaterThanOrEqual(44);
		expect(zoomInBox!.height).toBeGreaterThanOrEqual(44);
		expect(zoomOutBox!.width).toBeGreaterThanOrEqual(44);
		expect(zoomOutBox!.height).toBeGreaterThanOrEqual(44);
		expect(
			await mapPane.evaluate((pane) => getComputedStyle(pane).overscrollBehavior)
		).toMatch(/contain/);

		const closeButton = page.locator('.map-close-btn');
		await expect(closeButton).toBeFocused();
		await expect(listPane).toHaveAttribute('inert', '');
		await expect(page.locator('html')).toHaveClass(/mobile-map-expanded-lock/);

		// Focus trap: Tab / Shift+Tab stay inside the dialog
		for (let i = 0; i < 12; i += 1) {
			await page.keyboard.press('Tab');
			expect(
				await page.evaluate(() => {
					const pane = document.getElementById('restaurant-map-panel');
					const active = document.activeElement;
					return Boolean(pane && active && pane.contains(active));
				})
			).toBe(true);
		}
		await closeButton.focus();
		await page.keyboard.press('Shift+Tab');
		expect(
			await page.evaluate(() => {
				const pane = document.getElementById('restaurant-map-panel');
				const active = document.activeElement;
				return Boolean(pane && active && pane.contains(active) && active !== pane.querySelector('.map-close-btn'));
			})
		).toBe(true);
		await closeButton.focus();

		const searchInput = page.getByRole('combobox', { name: /search restaurants/i });
		await expect(searchInput).toBeVisible();

		await page.keyboard.press('Escape');

		await expect(mapPane).toBeHidden();
		await expect(mapPane).toHaveJSProperty('open', false);
		await expect(mapTrigger).toHaveAccessibleName('Open map');
		await expect(mapTrigger).toHaveAttribute('aria-expanded', 'false');
		await expect(mapTrigger).toBeFocused();
		await expect(listPane).not.toHaveAttribute('inert', '');
		await expect(page.locator('html')).not.toHaveClass(/mobile-map-expanded-lock/);
		await expect(page.getByRole('application')).toHaveCount(0);
	});

	test('first open explains deferred map loading until Leaflet is ready', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.setViewportSize({ width: 390, height: 844 });

		let releaseLeaflet: () => void = () => {};
		let finishLeafletHandler: () => void = () => {};
		let leafletRequestHeld = false;
		const leafletGate = new Promise<void>((resolve) => {
			releaseLeaflet = resolve;
		});
		const leafletHandlerDone = new Promise<void>((resolve) => {
			finishLeafletHandler = resolve;
		});
		const holdLeaflet: LeafletJavaScriptHandler = async (route, response, body) => {
			leafletRequestHeld = true;
			try {
				await leafletGate;
				await route.fulfill({ response, body });
			} finally {
				finishLeafletHandler();
			}
		};

		const removeLeafletInterception = await interceptLeafletJavaScript(page, holdLeaflet);
		try {
			await page.goto('/');
			await firstRenderedRow(page);
			await page.evaluate(
				() =>
					new Promise<void>((resolve) => {
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
					})
			);

			const mapContainer = page.locator('.map-container');
			expect(leafletRequestHeld).toBe(false);
			await expect(page.locator('.map-loading')).toHaveCount(0);
			await expect(page.getByRole('status')).toHaveCount(0);
			expect(await mapContainer.getAttribute('aria-busy')).toBeNull();

			await page.locator('.mobile-map-trigger').click();

			await expect(mapContainer).toHaveAttribute('aria-busy', 'true');
			const loadingStatus = page.getByRole('status');
			await expect(loadingStatus).toHaveText('Loading map…');
			await expect.poll(() => leafletRequestHeld).toBe(true);
			expect(
				await loadingStatus.evaluate(
					(element) => element.closest('[aria-busy="true"]') === null
				)
			).toBe(true);
			await expect(page.getByRole('application')).toHaveCount(0);
			await page.setViewportSize({ width: 1024, height: 768 });
			await expect(page.locator('.mobile-map-trigger')).toBeHidden();

			releaseLeaflet();

			await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
			await expect(page.getByRole('status')).toHaveCount(0);
			expect(await mapContainer.getAttribute('aria-busy')).toBeNull();
			const zoom = await wheelMapAndReadZoom(page);
			expect(zoom.after).toBeGreaterThan(zoom.before);
		} finally {
			releaseLeaflet();
			if (leafletRequestHeld) await leafletHandlerDone;
			await removeLeafletInterception();
		}
	});

	test('failed deferred map loading clears busy state and recovers after reload', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.setViewportSize({ width: 390, height: 844 });

		let leafletAttempts = 0;
		const failLeafletOnce: LeafletJavaScriptHandler = async (route, response, body) => {
			leafletAttempts += 1;
			if (leafletAttempts === 1) {
				await route.abort('failed');
				return;
			}
			await route.fulfill({ response, body });
		};

		const removeLeafletInterception = await interceptLeafletJavaScript(page, failLeafletOnce);
		try {
			await page.goto('/');
			await firstRenderedRow(page);
			await page.locator('.mobile-map-trigger').click();

			const mapContainer = page.locator('.map-container');
			const loadError = page.getByRole('alert');
			await expect(loadError).toContainText('Map couldn’t load.');
			expect(await mapContainer.getAttribute('aria-busy')).toBeNull();
			await expect(page.getByRole('status')).toHaveCount(0);
			await expect(page.getByRole('application')).toHaveCount(0);

			await loadError.getByRole('button', { name: 'Reload page' }).click();
			await firstRenderedRow(page);
			await page.locator('.mobile-map-trigger').click();

			await expect.poll(() => leafletAttempts).toBe(2);
			await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
			await expect(loadError).toHaveCount(0);
			expect(await mapContainer.getAttribute('aria-busy')).toBeNull();
		} finally {
			await removeLeafletInterception();
		}
	});

	test('Show on map returns focus to the drawer action after the sheet closes', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');

		const rowId = await openRenderedRowWithMapAction(page);
		const stableRow = page.locator(`#${rowId}`);
		const showOnMap = stableRow.getByRole('button', { name: 'Show on map' });

		await showOnMap.click();

		const mapPane = page.locator('#restaurant-map-panel');
		const closeButton = page.locator('.map-close-btn');
		await expect(mapPane).toBeVisible();
		await expect(closeButton).toBeFocused();

		await closeButton.click();

		await expect(mapPane).toBeHidden();
		await expect(
			page.locator(`#${rowId}`).getByRole('button', { name: 'Show on map' })
		).toBeFocused();
		await expect(page.locator('.list-pane')).not.toHaveAttribute('inert', '');
		await expect(page.locator('html')).not.toHaveClass(/mobile-map-expanded-lock/);
	});

	test('closed map never obstructs result actions across mobile widths', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		test.setTimeout(90_000);

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

	test('open sheet stays within the viewport across mobile widths', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		test.setTimeout(90_000);

		for (const viewport of mobileViewports) {
			await test.step(`${viewport.width}x${viewport.height}`, async () => {
				await page.setViewportSize(viewport);
				await page.goto('/');
				await firstRenderedRow(page);

				const mapTrigger = page.locator('.mobile-map-trigger');
				const mapPane = page.locator('#restaurant-map-panel');
				await mapTrigger.click();
				await expect(mapPane).toBeVisible();
				await expect(page.locator('html')).toHaveClass(/mobile-map-expanded-lock/);

				const bounds = await mapPane.evaluate((pane) => {
					const controls = document.querySelector<HTMLElement>('.controls-bar');
					if (!controls) throw new Error('Missing controls bar');
					const paneRect = pane.getBoundingClientRect();
					const controlsRect = controls.getBoundingClientRect();
					return {
						paneTop: paneRect.top,
						paneBottom: paneRect.bottom,
						controlsBottom: controlsRect.bottom,
						viewportBottom: window.innerHeight
					};
				});

				expect(
					bounds.paneTop,
					`${viewport.width}px sheet must start below the controls`
				).toBeGreaterThanOrEqual(bounds.controlsBottom - 2);
				expect(
					bounds.paneBottom,
					`${viewport.width}px sheet must retain its bottom safe-area gap`
				).toBeLessThanOrEqual(bounds.viewportBottom - 12);
			});
		}
	});

	test('open sheet removes Back to top until the deep-scrolled list is usable again', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await firstRenderedRow(page);

		const listScroll = page.locator('.list-scroll');
		// CI seeds only two rows, so this lifecycle test owns a data-independent
		// scroll precondition instead of coupling it to fixture cardinality.
		await listScroll.evaluate((element) => {
			const spacer = element.querySelector<HTMLElement>('.virtual-spacer');
			if (!spacer) throw new Error('Missing virtual spacer');
			spacer.style.minHeight = `${element.clientHeight + 500}px`;
		});
		await expect
			.poll(() => listScroll.evaluate((element) => element.scrollHeight - element.clientHeight))
			.toBeGreaterThan(300);
		await listScroll.evaluate((element) => element.scrollTo({ top: 500, behavior: 'auto' }));
		await expect.poll(() => listScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(300);

		const backToTop = page.getByRole('button', { name: 'Back to top' });
		await expect(backToTop).toBeVisible();
		const backToTopBox = await backToTop.boundingBox();
		expect(backToTopBox).toBeTruthy();
		expect(backToTopBox!.width).toBeGreaterThanOrEqual(44);
		expect(backToTopBox!.height).toBeGreaterThanOrEqual(44);

		await page.locator('.mobile-map-trigger').click();
		await expect(page.locator('#restaurant-map-panel')).toBeVisible();
		await expect(page.locator('.map-close-btn')).toBeFocused();
		await expect(backToTop).toHaveCount(0);
		if (backToTopBox) {
			const backToTopHit = await page.evaluate(
				({ x, y }) => document.elementFromPoint(x, y)?.closest('.back-to-top') !== null,
				{
					x: backToTopBox.x + backToTopBox.width / 2,
					y: backToTopBox.y + backToTopBox.height / 2
				}
			);
			expect(backToTopHit).toBe(false);
		}

		await page.locator('.map-close-btn').click();
		await expect(page.locator('#restaurant-map-panel')).toBeHidden();
		await expect(backToTop).toBeVisible();
		await expect.poll(() => listScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(300);
	});

	test('mobile-initialized map enables wheel zoom after crossing to desktop', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile initialization only');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await firstRenderedRow(page);

		await page.locator('.mobile-map-trigger').click();
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
		await page.setViewportSize({ width: 1024, height: 768 });
		await expect(page.locator('.mobile-map-trigger')).toBeHidden();
		await expect(page.locator('.map-container')).toBeVisible();

		const zoom = await wheelMapAndReadZoom(page);
		expect(zoom.after).toBeGreaterThan(zoom.before);
	});

	test('desktop-initialized map disables wheel zoom after crossing to mobile', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop initialization only');
		await page.setViewportSize({ width: 1024, height: 768 });
		await page.goto('/');
		await firstRenderedRow(page);
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });

		await page.setViewportSize({ width: 390, height: 844 });
		await page.locator('.mobile-map-trigger').click();
		await expect(page.locator('#restaurant-map-panel')).toBeVisible();

		const zoom = await wheelMapAndReadZoom(page);
		expect(zoom.after).toBe(zoom.before);
	});

	test('reduced-motion map open and close completes without runtime errors', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		const runtimeErrors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
		});
		page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await firstRenderedRow(page);

		const mapTrigger = page.locator('.mobile-map-trigger');
		await mapTrigger.click();
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });
		await page.locator('.map-close-btn').click();

		await expect(page.locator('#restaurant-map-panel')).toBeHidden();
		await expect(mapTrigger).toBeFocused();
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
				})
		);
		expect(runtimeErrors).toEqual([]);
	});

	test('geolocation reports its controlled permission error after loading', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.addInitScript(() => {
			let rejectPermission: (() => void) | undefined;
			Object.defineProperty(navigator, 'geolocation', {
				configurable: true,
				value: {
					getCurrentPosition(
						_success: PositionCallback,
						error?: PositionErrorCallback
					) {
						rejectPermission = () =>
							error?.({
								code: 1,
								message: 'Permission denied by test',
								PERMISSION_DENIED: 1,
								POSITION_UNAVAILABLE: 2,
								TIMEOUT: 3
							} as GeolocationPositionError);
					}
				}
			});
			(window as Window & { __rejectGeolocation?: () => void }).__rejectGeolocation = () =>
				rejectPermission?.();
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await firstRenderedRow(page);
		await page.locator('.mobile-map-trigger').click();
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });

		const locateButton = page.getByRole('button', { name: 'Jump to my current location' });
		const locateBox = await locateButton.boundingBox();
		expect(locateBox).toBeTruthy();
		expect(locateBox!.width).toBeGreaterThanOrEqual(44);
		expect(locateBox!.height).toBeGreaterThanOrEqual(44);
		expect(
			await locateButton.evaluate((button) => {
				const rect = button.getBoundingClientRect();
				const hit = document.elementFromPoint(
					rect.left + rect.width / 2,
					rect.top + rect.height / 2
				);
				return hit === button || button.contains(hit);
			})
		).toBe(true);
		await locateButton.click();
		await expect(locateButton).toBeDisabled();
		await expect(locateButton.locator('.spinner')).toBeVisible();

		await page.evaluate(() =>
			(window as Window & { __rejectGeolocation?: () => void }).__rejectGeolocation?.()
		);
		await expect(page.getByRole('alert')).toHaveText('Location access denied');
		await expect(locateButton).toBeEnabled();
	});

	test('unsupported geolocation message stays inside the 320px map sheet', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'geolocation', {
				configurable: true,
				value: undefined
			});
		});
		await page.setViewportSize({ width: 320, height: 700 });
		await page.goto('/');
		await firstRenderedRow(page);
		await page.locator('.mobile-map-trigger').click();
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });

		await page.getByRole('button', { name: 'Jump to my current location' }).click();
		const locationError = page.getByRole('alert');
		await expect(locationError).toHaveText('Geolocation is not supported by your browser');

		const bounds = await locationError.evaluate((error) => {
			const panel = document.querySelector('#restaurant-map-panel');
			if (!panel) throw new Error('Missing restaurant map panel');
			const errorRect = error.getBoundingClientRect();
			const panelRect = panel.getBoundingClientRect();
			return {
				error: {
					left: errorRect.left,
					top: errorRect.top,
					right: errorRect.right,
					bottom: errorRect.bottom
				},
				panel: {
					left: panelRect.left,
					top: panelRect.top,
					right: panelRect.right,
					bottom: panelRect.bottom
				},
				viewport: { width: window.innerWidth, height: window.innerHeight }
			};
		});

		expect(bounds.error.left).toBeGreaterThanOrEqual(bounds.panel.left);
		expect(bounds.error.top).toBeGreaterThanOrEqual(bounds.panel.top);
		expect(bounds.error.right).toBeLessThanOrEqual(bounds.panel.right);
		expect(bounds.error.bottom).toBeLessThanOrEqual(bounds.panel.bottom);
		expect(bounds.error.left).toBeGreaterThanOrEqual(0);
		expect(bounds.error.top).toBeGreaterThanOrEqual(0);
		expect(bounds.error.right).toBeLessThanOrEqual(bounds.viewport.width);
		expect(bounds.error.bottom).toBeLessThanOrEqual(bounds.viewport.height);
	});

	test('desktop breakpoint closes the mobile disclosure and focuses the inline map', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await firstRenderedRow(page);

		const mapTrigger = page.locator('.mobile-map-trigger');
		const mapPane = page.locator('#restaurant-map-panel');
		const listPane = page.locator('.list-pane');
		const mapApplication = page.locator('.map-container');
		await mapTrigger.click();
		await expect(mapPane).toBeVisible();
		await expect(mapApplication).toBeVisible({ timeout: 30_000 });

		await page.setViewportSize({ width: 1024, height: 768 });

		await expect(mapTrigger).toBeHidden();
		await expect(mapTrigger).toHaveAttribute('aria-expanded', 'false');
		await expect(mapPane).not.toHaveClass(/portal-expanded/);
		await expect(listPane).not.toHaveAttribute('inert', '');
		await expect(page.locator('html')).not.toHaveClass(/mobile-map-expanded-lock/);
		await expect(mapApplication).toBeFocused();

		await page.setViewportSize({ width: 390, height: 844 });

		await expect(mapTrigger).toBeVisible();
		await expect(mapTrigger).toHaveAccessibleName('Open map');
		await expect(mapTrigger).toHaveAttribute('aria-expanded', 'false');
		await expect(mapPane).toBeHidden();
		await expect(listPane).not.toHaveAttribute('inert', '');
		await expect(page.locator('html')).not.toHaveClass(/mobile-map-expanded-lock/);
	});

	test('desktop breakpoint restores a visible Show on map opener', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');

		const rowId = await openRenderedRowWithMapAction(page);
		const showOnMap = page
			.locator(`#${rowId}`)
			.getByRole('button', { name: 'Show on map' });
		await showOnMap.click();
		await expect(page.locator('.map-close-btn')).toBeFocused();

		await page.setViewportSize({ width: 1024, height: 768 });

		await expect(page.locator('#restaurant-map-panel')).not.toHaveClass(/portal-expanded/);
		await expect(
			page.locator(`#${rowId}`).getByRole('button', { name: 'Show on map' })
		).toBeFocused();
		await expect(page.locator('.list-pane')).not.toHaveAttribute('inert', '');
		await expect(page.locator('html')).not.toHaveClass(/mobile-map-expanded-lock/);
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
				await expect(mapPane).not.toHaveAttribute('role', 'dialog');
				await expect(mapPane).not.toHaveAttribute('aria-modal', 'true');
				await expect(mapPane).not.toHaveAttribute('tabindex', '0');
				expect(await mapPane.evaluate((element) => element.tagName)).toBe('DIALOG');
				await expect(mapPane).toHaveJSProperty('open', false);
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

	test('desktop map pane widens via click and keyboard without hover', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop viewport only');
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await firstRenderedRow(page);
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });

		const mapPane = page.locator('#restaurant-map-panel');
		const listPane = page.locator('.list-pane');
		const expandToggle = page.locator('.map-expand-toggle');
		await expect(expandToggle).toBeVisible();
		await expect(expandToggle).toHaveAccessibleName('Widen map');
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'false');
		const expandBox = await expandToggle.boundingBox();
		expect(expandBox).toBeTruthy();
		expect(expandBox!.width).toBeGreaterThanOrEqual(44);
		expect(expandBox!.height).toBeGreaterThanOrEqual(44);

		const paneWidth = (locator: Locator) =>
			locator.evaluate((pane) => pane.getBoundingClientRect().width);
		const collapsedMapWidth = await paneWidth(mapPane);
		const collapsedListWidth = await paneWidth(listPane);

		// Focusing Leaflet chrome must not expand via :focus-within
		await page.getByRole('button', { name: 'Zoom in' }).focus();
		expect(await paneWidth(mapPane)).toBeLessThanOrEqual(collapsedMapWidth + 8);
		expect(await paneWidth(listPane)).toBeGreaterThanOrEqual(collapsedListWidth - 8);

		await listPane.click({ position: { x: 40, y: 40 } });
		expect(await paneWidth(mapPane)).toBeLessThanOrEqual(collapsedMapWidth + 8);

		// Click/keyboard is the required path — hover is not needed to widen
		await expandToggle.click();
		await expect(expandToggle).toHaveAccessibleName('Narrow map');
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(mapPane).toHaveClass(/desktop-expanded/);
		await expect.poll(() => paneWidth(mapPane)).toBeGreaterThan(collapsedMapWidth + 20);
		await expect.poll(() => paneWidth(listPane)).toBeLessThan(collapsedListWidth - 8);

		await listPane.click({ position: { x: 40, y: 40 } });
		await expect.poll(() => paneWidth(mapPane)).toBeGreaterThan(collapsedMapWidth + 20);

		await expandToggle.click();
		await expect(expandToggle).toHaveAccessibleName('Widen map');
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(mapPane).not.toHaveClass(/desktop-expanded/);
		await expect.poll(() => paneWidth(mapPane)).toBeLessThanOrEqual(collapsedMapWidth + 8);

		await expandToggle.focus();
		await expect(expandToggle).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(mapPane).toHaveClass(/desktop-expanded/);
		await expect.poll(() => paneWidth(mapPane)).toBeGreaterThan(collapsedMapWidth + 20);

		await page.keyboard.press('Escape');
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(mapPane).not.toHaveClass(/desktop-expanded/);
		await expect.poll(() => paneWidth(mapPane)).toBeLessThanOrEqual(collapsedMapWidth + 8);

		await expandToggle.focus();
		await page.keyboard.press('Space');
		await expect(mapPane).toHaveClass(/desktop-expanded/);
		await page.keyboard.press('Escape');
		await expect(mapPane).not.toHaveClass(/desktop-expanded/);

		// Pin still works when motion is reduced (no transition required)
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await expandToggle.click();
		await expect(mapPane).toHaveClass(/desktop-expanded/);
		await expect.poll(() => paneWidth(mapPane)).toBeGreaterThan(collapsedMapWidth + 20);
		await expandToggle.click();
		await expect(mapPane).not.toHaveClass(/desktop-expanded/);
		await expect.poll(() => paneWidth(mapPane)).toBeLessThanOrEqual(collapsedMapWidth + 8);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(expandToggle).toHaveCount(0);
		await expect(page.locator('.mobile-map-trigger')).toBeVisible();
	});

	test('desktop map hover widens as a delayed enhancement, not the only path', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop viewport only');
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await firstRenderedRow(page);
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });

		const mapPane = page.locator('#restaurant-map-panel');
		const listPane = page.locator('.list-pane');
		const expandToggle = page.locator('.map-expand-toggle');
		const paneWidth = (locator: Locator) =>
			locator.evaluate((pane) => pane.getBoundingClientRect().width);
		const collapsedMapWidth = await paneWidth(mapPane);

		await expect(expandToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(mapPane).not.toHaveClass(/desktop-expanded/);

		await page.locator('.leaflet-container').hover({ position: { x: 80, y: 200 } });
		expect(await paneWidth(mapPane)).toBeLessThanOrEqual(collapsedMapWidth + 8);
		await expect(mapPane).not.toHaveClass(/desktop-expanded/);

		await expect(mapPane).toHaveClass(/desktop-expanded/, { timeout: 1500 });
		await expect.poll(() => paneWidth(mapPane)).toBeGreaterThan(collapsedMapWidth + 20);
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(expandToggle).toHaveAccessibleName('Widen map');

		await listPane.hover({ position: { x: 40, y: 40 } });
		await expect(mapPane).toHaveClass(/desktop-expanded/);
		await expect(mapPane).not.toHaveClass(/desktop-expanded/, { timeout: 1500 });
		await expect.poll(() => paneWidth(mapPane)).toBeLessThanOrEqual(collapsedMapWidth + 8);

		await page.locator('.leaflet-container').hover({ position: { x: 80, y: 200 } });
		await expect(mapPane).toHaveClass(/desktop-expanded/, { timeout: 1500 });
		await page.keyboard.press('Escape');
		await expect(mapPane).not.toHaveClass(/desktop-expanded/);
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'false');

		await expandToggle.click();
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'true');
		await expect(mapPane).toHaveClass(/desktop-expanded/);
		await listPane.hover({ position: { x: 40, y: 40 } });
		await page.waitForTimeout(500);
		await expect(mapPane).toHaveClass(/desktop-expanded/);
		await expect.poll(() => paneWidth(mapPane)).toBeGreaterThan(collapsedMapWidth + 20);

		await page.keyboard.press('Escape');
		await expect(expandToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(mapPane).not.toHaveClass(/desktop-expanded/);
	});

	test('desktop Tab leaves the in-flow map pane and reaches sort and rows', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop viewport only');
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await firstRenderedRow(page);
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30_000 });

		const mapPane = page.locator('#restaurant-map-panel');
		await expect(mapPane).toHaveJSProperty('open', false);

		await page.getByRole('button', { name: 'Zoom in' }).focus();
		await expect(page.getByRole('button', { name: 'Zoom in' })).toBeFocused();

		let leftMap = false;
		for (let i = 0; i < 16; i += 1) {
			await page.keyboard.press('Tab');
			const inMap = await page.evaluate(() => {
				const pane = document.getElementById('restaurant-map-panel');
				const active = document.activeElement;
				return Boolean(pane && active instanceof Node && pane.contains(active));
			});
			if (!inMap) {
				leftMap = true;
				break;
			}
		}

		expect(leftMap, 'Tab must leave the closed in-flow map instead of wrapping forever').toBe(
			true
		);
		await expect(page.locator('.map-expand-toggle')).toBeFocused();

		await page.keyboard.press('Tab');
		await expect(page.locator('.sort-btn').first()).toBeFocused();

		let reachedRow = false;
		for (let i = 0; i < 8; i += 1) {
			await page.keyboard.press('Tab');
			reachedRow = await page.evaluate(() => {
				const active = document.activeElement;
				return active instanceof HTMLElement && active.classList.contains('row-toggle');
			});
			if (reachedRow) break;
		}
		expect(reachedRow).toBe(true);
	});

	test('short zoomed phone viewport keeps restaurant rows reachable', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
		test.setTimeout(60_000);
		await page.setViewportSize({ width: 195, height: 422 });
		await page.goto('/');

		const row = await firstRenderedRow(page);
		await row.scrollIntoViewIfNeeded();
		await expect(row).toBeVisible();

		const inViewport = await row.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return rect.height > 8 && rect.bottom > 0 && rect.top < window.innerHeight;
		});
		expect(inViewport).toBe(true);
	});
});
