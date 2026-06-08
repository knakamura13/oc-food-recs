import type { Restaurant } from './types';
import { appState } from './stores.svelte';

export function resetAppState(): void {
	appState.searchQuery = '';
	appState.activeCuisines = [];
	appState.activeCities = [];
	appState.activeSubreddits = [];
	appState.freshnessCutoff = null;
	appState.showUnmapped = false;
	appState.sortKey = 'score';
	appState.sortDirection = 'desc';
	appState.selectedRestaurantSlug = null;
	appState.hoveredRestaurantSlug = null;
	appState.mapTarget = null;
	appState.listScrollTarget = null;
	appState.fitBoundsTarget = null;
}

export function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
	return {
		name: 'Test Restaurant',
		slug: 'test-restaurant',
		location: 'Irvine',
		cuisine: 'American',
		aggregate_score: 10,
		mention_count: 2,
		endorsement_count: 0,
		lat: 33.6846,
		lng: -117.8265,
		mentions: [],
		source_threads: ['thread-1'],
		...overrides
	};
}
