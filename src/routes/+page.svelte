<script lang="ts">
	import { onMount } from 'svelte';
	import data from '$lib/data/restaurants.json';
	import type { Restaurant } from '$lib/types';
	import { appState, slugify, normalizeCuisine, normalizeCity } from '$lib/stores.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Map from '$lib/components/Map.svelte';
	import RestaurantList from '$lib/components/RestaurantList.svelte';
	import BackToTop from '$lib/components/BackToTop.svelte';

	const allRestaurants: Restaurant[] = data.restaurants as Restaurant[];

	// Compute unique cuisine and city names for search matching
	const cuisineSet = new Set<string>();
	const citySet = new Set<string>();
	for (const r of allRestaurants) {
		const c = normalizeCuisine(r.cuisine);
		if (c !== 'Unknown' && c !== 'Other') cuisineSet.add(c);
		const city = normalizeCity(r.location);
		if (city && city !== 'Other') citySet.add(city);
	}
	const cuisineNames = [...cuisineSet].sort();
	const cityNames = [...citySet].sort();

	let prevCuisines = $state('');
	let prevCities = $state('');

	let filteredRestaurants = $derived.by(() => {
		let result = allRestaurants;

		if (appState.activeCuisines.length > 0) {
			result = result.filter((r) => {
				const normalized = normalizeCuisine(r.cuisine);
				return appState.activeCuisines.includes(normalized);
			});
		}

		if (appState.activeCities.length > 0) {
			result = result.filter((r) => {
				const normalized = normalizeCity(r.location);
				return normalized ? appState.activeCities.includes(normalized) : false;
			});
		}

		return result;
	});

	// Trigger fitBounds when filters change
	$effect(() => {
		const cuisineKey = appState.activeCuisines.join(',');
		const cityKey = appState.activeCities.join(',');
		const currentKey = `${cuisineKey}|${cityKey}`;
		const prevKey = `${prevCuisines}|${prevCities}`;

		if (currentKey !== prevKey) {
			prevCuisines = cuisineKey;
			prevCities = cityKey;

			if (appState.activeCuisines.length > 0 || appState.activeCities.length > 0) {
				// Trigger map zoom to filtered restaurants
				appState.fitBoundsTarget = filteredRestaurants;
			} else {
				// Reset to full OC view
				appState.fitBoundsTarget = allRestaurants;
			}
		}
	});

	// Sync URL params -> state on mount
	onMount(() => {
		const params = new URLSearchParams(window.location.search);

		const q = params.get('q');
		if (q) appState.searchQuery = q;

		const cuisine = params.get('cuisine');
		if (cuisine) appState.activeCuisines = cuisine.split(',').filter(Boolean);

		const city = params.get('city');
		if (city) appState.activeCities = city.split(',').filter(Boolean);

		const sort = params.get('sort');
		if (sort === 'name' || sort === 'score') {
			appState.sortKey = sort;
		}
		const sortDir = params.get('sortdir');
		if (sortDir === 'asc' || sortDir === 'desc') {
			appState.sortDirection = sortDir;
		}

		const restaurant = params.get('restaurant');
		if (restaurant) {
			appState.selectedRestaurantSlug = restaurant;
			const match = allRestaurants.find((r) => slugify(r.name) === restaurant);
			if (match) {
				appState.listScrollTarget = match;
				if (match.lat && match.lng) {
					appState.mapTarget = match;
				}
			}
		}
	});

	// Sync state -> URL params
	$effect(() => {
		if (typeof window === 'undefined') return;

		const params = new URLSearchParams();

		if (appState.searchQuery) params.set('q', appState.searchQuery);
		if (appState.activeCuisines.length > 0) params.set('cuisine', appState.activeCuisines.join(','));
		if (appState.activeCities.length > 0) params.set('city', appState.activeCities.join(','));
		if (appState.sortKey) params.set('sort', appState.sortKey);
		if (appState.sortDirection !== 'desc') params.set('sortdir', appState.sortDirection);
		if (appState.selectedRestaurantSlug) params.set('restaurant', appState.selectedRestaurantSlug);

		const qs = params.toString();
		const newUrl = qs ? `?${qs}` : window.location.pathname;

		if (window.location.search !== (qs ? `?${qs}` : '')) {
			history.replaceState(null, '', newUrl);
		}
	});
</script>

<svelte:head>
	<title>Best Mom & Pop Restaurants in Orange County | Reddit Community Picks</title>
	<meta
		name="description"
		content="Explore 289 community-recommended mom and pop restaurants in Orange County, CA — curated from a Reddit thread with 735 responses."
	/>
	<meta name="theme-color" content="#ff4500" />
	<link rel="dns-prefetch" href="https://a.tile.openstreetmap.org" />
	<link rel="dns-prefetch" href="https://b.tile.openstreetmap.org" />
	<link rel="dns-prefetch" href="https://c.tile.openstreetmap.org" />
</svelte:head>

<Hero />
<SearchBar restaurants={allRestaurants} {cuisineNames} {cityNames} />
<FilterBar restaurants={allRestaurants} />

<main class="split-view" aria-label="Restaurant map and list">
	<div class="map-side">
		<Map restaurants={filteredRestaurants} />
	</div>
	<div class="list-side">
		<RestaurantList restaurants={filteredRestaurants} />
	</div>
</main>

<BackToTop />

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
			sans-serif;
		color: #333;
		background: #fafafa;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		line-height: 1.5;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(*:focus-visible) {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	.split-view {
		display: flex;
		height: calc(100vh - 220px);
		min-height: 500px;
		padding: 0.5rem;
		gap: 0.5rem;
		max-width: 1400px;
		margin: 0 auto 40vh;
	}

	.map-side {
		flex: 1;
		min-width: 0;
	}

	.list-side {
		flex: 1;
		min-width: 0;
		border: 1px solid #e8e8e8;
		border-radius: 10px;
		overflow: hidden;
		background: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06);
	}

	@media (max-width: 768px) {
		.split-view {
			flex-direction: column;
			height: auto;
			padding: 0.25rem;
			gap: 0.25rem;
		}

		.map-side {
			height: 200px;
			min-height: 200px;
			flex-shrink: 0;
		}

		.list-side {
			height: auto;
			border: none;
			overflow: visible;
		}
	}
</style>
