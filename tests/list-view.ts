import type { Page } from '@playwright/test';

/**
 * Phones land on the map by default. Specs about the list, the toolbar or the Open map button
 * start from the list-only state a visitor reaches by closing the map; the app remembers that
 * choice for the tab's session (keyed by the tab's window.name), so seeding both before load is
 * the same as having closed the map.
 */
export async function startOnList(page: Page) {
	await page.addInitScript(() => {
		window.name = 'oc-tab-spec';
		sessionStorage.setItem('oc-phone-view', 'list:oc-tab-spec');
	});
}
