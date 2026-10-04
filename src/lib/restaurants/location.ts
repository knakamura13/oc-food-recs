import { appState } from './stores.svelte';
import { distanceMiles } from './distance';

let generation = 0;

/** Only called from explicit user actions. Coordinates stay in browser memory. */
export async function requestUserLocation(): Promise<boolean> {
	if (appState.locating) return false;
	appState.locationError = null;
	if (typeof navigator === 'undefined' || !navigator.geolocation) {
		appState.locationError = 'Geolocation is not supported by your browser';
		return false;
	}
	const request = ++generation;
	appState.locating = true;
	return new Promise((resolve) => {
		const fail = (message: string) => {
			if (request === generation) {
				appState.locating = false;
				appState.locationError = message;
			}
			resolve(false);
		};
		try {
			navigator.geolocation.getCurrentPosition(position => {
				if (request !== generation) { resolve(false); return; }
				const coords = position?.coords;
				if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
					fail('Unable to get a valid location');
					return;
				}
				const location = { lat: coords.latitude, lng: coords.longitude };
				if (distanceMiles(location, location) === null) {
					fail('Unable to get a valid location');
					return;
				}
				appState.userLocation = location;
				appState.locating = false;
				resolve(true);
			}, error => {
				fail(error.code === 1 ? 'Location access denied. You can still browse by city.' :
					error.code === 3 ? 'Location request timed out. Try Near me again.' :
					'Unable to get your location. Try Near me again.');
			}, { timeout: 10000, maximumAge: 60000 });
		} catch {
			fail('Unable to get your location. Try Near me again.');
		}
	});
}

/** Invalidate pending callbacks as well as dropping the coordinates. */
export function forgetUserLocation(): void {
	generation++;
	appState.userLocation = null;
	appState.radiusMiles = null;
	appState.locating = false;
	appState.locationError = null;
	if (appState.sortKey === 'distance') {
		appState.sortKey = appState.searchQuery.trim() ? 'relevance' : 'score';
		appState.sortDirection = 'desc';
	}
}
