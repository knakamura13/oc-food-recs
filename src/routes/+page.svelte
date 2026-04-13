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

	let mapExpanded = $state(false);

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

<section class="hero-section">
	<Hero />
</section>

<div class="app-trap">
	<div class="controls-bar">
		<SearchBar restaurants={allRestaurants} {cuisineNames} {cityNames} />
		<FilterBar restaurants={allRestaurants} />
	</div>
	<div class="content-area">
		<div
			class="map-pane"
			class:portal-expanded={mapExpanded}
			onclick={() => { if (!mapExpanded) mapExpanded = true; }}
		>
			<Map restaurants={filteredRestaurants} {mapExpanded} />
			{#if mapExpanded}
				<button
					class="map-close-btn"
					onclick={(e) => { e.stopPropagation(); mapExpanded = false; }}
					aria-label="Close map"
				>&times;</button>
			{/if}
		</div>
		<div class="list-pane">
			<RestaurantList restaurants={filteredRestaurants} />
		</div>
	</div>
</div>

{#if mapExpanded}
	<div class="portal-backdrop" onclick={() => (mapExpanded = false)} role="presentation"></div>
{/if}

<BackToTop />

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	:global(body) {
		margin: 0;
		font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
			Arial, sans-serif;
		color: #3e2c23;
		background: #faf7f2;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		line-height: 1.55;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(*:focus-visible) {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	/* Hero parallax fade — CSS scroll-driven, no JS */
	@supports (animation-timeline: scroll()) {
		.hero-section {
			animation: hero-fade linear both;
			animation-timeline: scroll(root);
			animation-range: 0 80%;
		}
	}

	@keyframes hero-fade {
		from {
			opacity: 1;
			transform: translateY(0);
		}
		to {
			opacity: 0;
			transform: translateY(-24px);
		}
	}

	/* Sticky trap — locks to top once hero scrolls past */
	.app-trap {
		position: sticky;
		top: 0;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: #fff;
		z-index: 1100;
	}

	/* Controls bar — no overflow set so dropdowns escape freely into the viewport */
	.controls-bar {
		flex-shrink: 0;
		position: relative;
		z-index: 1200; /* above map portal (1050) and backdrop (1040) */
	}

	/* Content area clips its children (map + list) but NOT the controls-bar sibling */
	.content-area {
		flex: 1;
		display: flex;
		min-height: 0;
		overflow: hidden;
	}

	/* ── Desktop: CSS :has() hover morph (≥ 1024px) ─────────────────────── */
	@media (min-width: 1024px) {
		.map-pane {
			flex-basis: 25%;
			flex-shrink: 0;
			position: relative;
			overflow: hidden;
			min-width: 0;
			transition: flex-basis 0.4s ease;
		}

		.list-pane {
			flex: 1;
			min-width: 0;
			position: relative;
			z-index: 1;
			margin-left: -48px; /* overlap the map — gives a layered depth effect */
			box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
			overflow-y: auto;
			overscroll-behavior: contain;
			background: #fff;
			border-radius: 12px 0 0 0;
			transition: flex-basis 0.4s ease, margin-left 0.4s ease, box-shadow 0.4s ease;
		}

		/* Hover: map expands to 1/3, list retreats, layered depth collapses to flat */
		.content-area:has(.map-pane:hover) .map-pane {
			flex-basis: 33.33%;
		}

		.content-area:has(.map-pane:hover) .list-pane {
			flex-basis: 66.67%;
			margin-left: 0;
			box-shadow: none;
		}
	}

	/* ── Mobile: map-pane IS the circular FAB portal (< 1024px) ─────────── */
	@media (max-width: 1023px) {
		.map-pane {
			position: fixed;
			bottom: 24px;
			right: 24px;
			width: 80px;
			height: 80px;
			border-radius: 50%;
			border: 4px solid white;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
			z-index: 1000;
			cursor: pointer;
			overflow: hidden;
			transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.map-pane.portal-expanded {
			width: calc(100vw - 32px);
			height: calc(100dvh - 120px);
			bottom: 16px;
			right: 16px;
			border-radius: 16px;
			cursor: default;
			z-index: 1050;
		}

		.list-pane {
			width: 100%;
			overflow-y: auto;
			overscroll-behavior: contain;
		}

		.portal-backdrop {
			position: fixed;
			inset: 0;
			z-index: 1110;
			background: rgba(0, 0, 0, 0.4);
			backdrop-filter: blur(4px);
			-webkit-backdrop-filter: blur(4px);
		}

		.map-close-btn {
			position: absolute;
			top: 12px;
			right: 12px;
			width: 36px;
			height: 36px;
			border-radius: 50%;
			border: none;
			background: rgba(255, 255, 255, 0.92);
			font-size: 1.4rem;
			line-height: 1;
			cursor: pointer;
			z-index: 1060;
			display: flex;
			align-items: center;
			justify-content: center;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		}

		/* When map expands on mobile, push controls and list behind the map */
		@media (max-width: 1023px) {
			.app-trap:has(.map-pane.portal-expanded) .controls-bar {
				z-index: 1020;
			}
			.app-trap:has(.map-pane.portal-expanded) .list-pane {
				z-index: 1005;
			}
		}
	}

	/* Hide mobile-only elements on desktop */
	@media (min-width: 1024px) {
		.map-close-btn {
			display: none;
		}

		.portal-backdrop {
			display: none;
		}
	}
</style>
