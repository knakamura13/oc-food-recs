import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPageTitle, DEFAULT_TITLE } from './page-meta';
import { formatMonthYear } from './stores.svelte';
import { appState } from './stores.svelte';
import { resetAppState } from './test-utils';
import { requestUserLocation, forgetUserLocation } from './location';
import { buildSearchParams, isValidSortKey, parseSearchParams } from './url-state';

describe('session location', () => {
	beforeEach(resetAppState);
	it('preserves the view on denied, unavailable or timed-out requests', async () => {
		for (const code of [1, 2, 3]) {
			Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn((_, fail) => fail({ code })) } });
			expect(await requestUserLocation()).toBe(false);
			expect(appState.userLocation).toBeNull();
			expect(appState.sortKey).toBe('score');
			expect(appState.locating).toBe(false);
			expect(appState.locationError).toBeTruthy();
		}
	});
	it('handles unsupported browsers', async () => {
		Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
		expect(await requestUserLocation()).toBe(false);
		expect(appState.locationError).toMatch(/not supported/);
	});
	it('does not resurrect location after forgetting an in-flight request', async () => {
		let complete: (position: unknown) => void = () => {};
		Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn(success => { complete = success; }) } });
		const pending = requestUserLocation();
		forgetUserLocation();
		complete({ coords: { latitude: 33.7, longitude: -117.8 } });
		expect(await pending).toBe(false);
		expect(appState.userLocation).toBeNull();
	});
	it('validates distance URLs but excludes session-only distance state from shared links', () => {
		expect(isValidSortKey('distance')).toBe(true);
		expect(parseSearchParams(new URLSearchParams('sort=distance')).sortKey).toBe('distance');
		appState.userLocation = { lat: 33.7, lng: -117.8 };
		appState.radiusMiles = 5;
		appState.sortKey = 'distance'; appState.sortDirection = 'asc';
		expect(buildSearchParams(appState).toString()).toBe('');
	});
});

	it('uses the UTC month at the Pacific year boundary', () => {
	expect(formatMonthYear(Date.parse('2019-01-01T00:00:00Z'))).toBe('Jan 2019');
	});
	it('omits local distance from share metadata', () => {
	expect(buildPageTitle({ sortKey: 'distance' })).toBe(DEFAULT_TITLE);
	});

describe('location refresh validation', () => {
	beforeEach(resetAppState);
	it('accepts one successful request and avoids a duplicate prompt', async () => {
		let finish: (p: unknown) => void = () => {};
		const getCurrentPosition = vi.fn(success => { finish = success; });
		Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
		const pending = requestUserLocation();
		expect(await requestUserLocation()).toBe(false);
		expect(getCurrentPosition).toHaveBeenCalledTimes(1);
		finish({ coords: { latitude: 33.7, longitude: -117.8 } });
		expect(await pending).toBe(true);
		expect(appState.userLocation).toEqual({ lat: 33.7, lng: -117.8 });
		expect(appState.locating).toBe(false);
	});
	it('preserves prior location and sorting after malformed or failed refresh', async () => {
		appState.userLocation = { lat: 33.7, lng: -117.8 };
		appState.sortKey = 'distance'; appState.sortDirection = 'asc'; appState.radiusMiles = 5;
		for (const latitude of [NaN, 91]) {
			Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn(success => success({ coords: { latitude, longitude: 0 } })) } });
			expect(await requestUserLocation()).toBe(false);
			expect(appState.userLocation).toEqual({ lat: 33.7, lng: -117.8 });
			expect(appState.radiusMiles).toBe(5);
			expect(appState.sortKey).toBe('distance');
		}
		Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn((_, fail) => fail({ code: 1 })) } });
		expect(await requestUserLocation()).toBe(false);
		expect(appState.userLocation).toEqual({ lat: 33.7, lng: -117.8 });
	});
});

it('rejects a missing coordinate payload without leaving the request busy', async () => {
	resetAppState();
	Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn(success => success({})) } });
	expect(await requestUserLocation()).toBe(false);
	expect(appState.locating).toBe(false);
});
