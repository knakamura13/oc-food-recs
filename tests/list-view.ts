import type { Page } from '@playwright/test';

/**
 * Phones land on the map by default. Specs about the list, the toolbar or the Open map button
 * start from the list-only state a visitor reaches by closing the map; the app remembers that
 * choice for the tab's session, so seeding it before load is the same as having closed the map.
 */
export async function startOnList(page: Page) {
	await page.addInitScript(() => sessionStorage.setItem('oc-phone-view', 'list'));
}
