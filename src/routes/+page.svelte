<script lang="ts">
	import { X } from 'lucide-svelte';
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import type { Restaurant } from '$lib/restaurants/types';
	import {
		appState,
		normalizeCuisine,
		normalizeCity,
		dateExtentOf
	} from '$lib/restaurants/stores.svelte';
	import {
		countEndorsements,
		createSliceCache,
		sliceRestaurantMentions
	} from '$lib/restaurants/filter-restaurants';
	import Hero from '$lib/restaurants/components/Hero.svelte';
	import SearchBar from '$lib/restaurants/components/SearchBar.svelte';
	import FilterBar from '$lib/restaurants/components/FilterBar.svelte';
	import Map from '$lib/restaurants/components/Map.svelte';
	import RestaurantList from '$lib/restaurants/components/RestaurantList.svelte';
	import BackToTop from '$lib/restaurants/components/BackToTop.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const allRestaurants: Restaurant[] = $derived.by(() =>
		(data.dataset.restaurants as Restaurant[]).map((r) => ({
			...r,
			endorsement_count: r.endorsement_count ?? countEndorsements(r.mentions)
		}))
	);
	const threadCount = $derived(data.dataset.meta.source_threads.length);

	// thread_id -> subreddit, so mentions/restaurants can be attributed to their origin subreddit.
	// (Plain object, not a Map — `Map` is shadowed by the Map.svelte component import above.)
	const threadSubreddit = $derived.by(() => {
		const lookup: Record<string, string> = {};
		for (const t of data.dataset.meta.source_threads) lookup[t.id] = t.subreddit;
		return lookup;
	});

	// Full-dataset comment-date range (epoch ms) — the fixed extent for the recency slider/axis.
	const dateExtent = $derived(dateExtentOf(allRestaurants));

	// Compute unique cuisine and city names for search matching
	const cuisineNames = $derived.by(() => {
		const set = new Set<string>();
		for (const r of allRestaurants) {
			const c = normalizeCuisine(r.cuisine);
			if (c !== 'Unknown' && c !== 'Other') set.add(c);
		}
		return [...set].sort();
	});
	const cityNames = $derived.by(() => {
		const set = new Set<string>();
		for (const r of allRestaurants) {
			const city = normalizeCity(r.location);
			if (city && city !== 'Other') set.add(city);
		}
		return [...set].sort();
	});

	let prevCuisines = $state('');
	let prevCities = $state('');
	let prevSubreddits = $state('');

	let mapExpanded = $state(false);
	let appTrapEl = $state<HTMLDivElement | undefined>(undefined);
	let controlsBarEl = $state<HTMLDivElement | undefined>(undefined);
	/** Subscribed by mobile-map $effect so resize clears scroll lock when crossing the breakpoint */
	let viewportWidth = $state(0);
	// True only while the window is actively resizing; gates off the map-pane transition so
	// the desktop/mobile breakpoint switch is instant instead of morphing (the transition is
	// meant only for the tap-to-expand toggle, which never involves a resize).
	let suppressMapTransition = $state(false);
	let resizeSettleTimer: ReturnType<typeof setTimeout> | undefined;

	const MOBILE_MAX_PX = 1023;

	function isMobileViewport() {
		const w = viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : MOBILE_MAX_PX + 1);
		return w <= MOBILE_MAX_PX;
	}

	/** Viewport-space bottom edge of controls + gap; used as `top` for fixed expanded map */
	function updateMobileMapTopOffsetVar() {
		if (typeof document === 'undefined' || !controlsBarEl) return;
		const bottom = Math.ceil(controlsBarEl.getBoundingClientRect().bottom);
		document.documentElement.style.setProperty('--mobile-map-top-offset', `${bottom + 8}px`);
	}

	/** Scroll document so controls (search) sit at the top; bypasses `html { scroll-behavior: smooth }` */
	function snapMobileShellToTop() {
		if (typeof window === 'undefined') return;
		const anchor = controlsBarEl ?? appTrapEl;
		if (!anchor) return;
		const html = document.documentElement;
		const prev = html.style.scrollBehavior;
		html.style.scrollBehavior = 'auto';
		const y = window.scrollY + anchor.getBoundingClientRect().top;
		window.scrollTo(0, Math.max(0, y));
		html.style.scrollBehavior = prev;
	}

	// Mobile expanded map: snap shell to top, lock page scroll, measure controls for map placement
	$effect(() => {
		if (typeof window === 'undefined') return;

		const expanded = mapExpanded;
		const _vw = viewportWidth;
		const mobile = isMobileViewport();

		if (!expanded || !mobile) {
			document.documentElement.classList.remove('mobile-map-expanded-lock');
			document.documentElement.style.removeProperty('--mobile-map-top-offset');
			return;
		}

		let cancelled = false;
		let ro: ResizeObserver | null = null;

		void tick().then(() => {
			if (cancelled) return;
			snapMobileShellToTop();
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (cancelled) return;
					updateMobileMapTopOffsetVar();
					ro = new ResizeObserver(() => updateMobileMapTopOffsetVar());
					if (controlsBarEl) ro.observe(controlsBarEl);
					document.documentElement.classList.add('mobile-map-expanded-lock');
				});
			});
		});

		return () => {
			cancelled = true;
			ro?.disconnect();
			document.documentElement.classList.remove('mobile-map-expanded-lock');
			document.documentElement.style.removeProperty('--mobile-map-top-offset');
		};
	});

	const subredditSliceCache = createSliceCache();
	const recencySliceCache = createSliceCache();

	let restaurantsBeforeFreshness = $derived.by(() => {
		let result = allRestaurants;

		// Subreddit filter: keep only mentions from the selected subreddit(s) and recompute
		// each restaurant's aggregates from that slice so datasources never blend.
		if (appState.activeSubreddits.length > 0) {
			const active = new Set(appState.activeSubreddits);
			const subredditKey = appState.activeSubreddits.join(',');
			result = result.flatMap((r) => {
				const kept = r.mentions.filter((m) => {
					const sub = threadSubreddit[m.thread_id];
					return sub ? active.has(sub) : false;
				});
				const sliced = sliceRestaurantMentions(
					r,
					kept,
					subredditSliceCache,
					`${r.slug}|sub:${subredditKey}`
				);
				return sliced ? [sliced] : [];
			});
		}

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

		if (!appState.showUnmapped) {
			result = result.filter((r) => r.lat != null && r.lng != null);
		}

		return result;
	});

	// Recency filter (mention-level): keep mentions on/after the cutoff (undated mentions are always
	// kept), re-score from the kept slice, and drop restaurants left with no qualifying mentions.
	// Reads restaurantsBeforeFreshness so the histogram (fed the same intermediate) reacts to the
	// other filters while staying stable as the slider handle moves.
	let filteredRestaurants = $derived.by(() => {
		const cutoff = appState.freshnessCutoff;
		if (cutoff === null || cutoff <= dateExtent.min) return restaurantsBeforeFreshness;
		return restaurantsBeforeFreshness.flatMap((r) => {
			const kept = r.mentions.filter((m) => {
				if (!m.comment_date) return true;
				const t = Date.parse(m.comment_date);
				return Number.isNaN(t) || t >= cutoff;
			});
			const sliced = sliceRestaurantMentions(
				r,
				kept,
				recencySliceCache,
				`${r.slug}|cutoff:${cutoff}`
			);
			return sliced ? [sliced] : [];
		});
	});

	// Trigger fitBounds when filters change
	$effect(() => {
		const cuisineKey = appState.activeCuisines.join(',');
		const cityKey = appState.activeCities.join(',');
		const subredditKey = appState.activeSubreddits.join(',');
		const currentKey = `${cuisineKey}|${cityKey}|${subredditKey}`;
		const prevKey = `${prevCuisines}|${prevCities}|${prevSubreddits}`;

		if (currentKey !== prevKey) {
			prevCuisines = cuisineKey;
			prevCities = cityKey;
			prevSubreddits = subredditKey;

			if (
				appState.activeCuisines.length > 0 ||
				appState.activeCities.length > 0 ||
				appState.activeSubreddits.length > 0
			) {
				// Trigger map zoom to filtered restaurants
				appState.fitBoundsTarget = filteredRestaurants.filter((r) => r.lat != null && r.lng != null).map((r) => ({ lat: r.lat as number, lng: r.lng as number }));
			} else {
				// Reset to full OC view
				appState.fitBoundsTarget = allRestaurants.filter((r) => r.lat != null && r.lng != null).map((r) => ({ lat: r.lat as number, lng: r.lng as number }));
			}
		}
	});

	// Recency commits ~10×/sec while dragging; debounce the map re-zoom to drag-end so it doesn't
	// continuously animate. (The list + counts still update live off filteredRestaurants.)
	let freshnessMapInitialized = false;
	let mapFreshnessTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const cutoff = appState.freshnessCutoff; // the only tracked dependency
		void cutoff;
		if (!freshnessMapInitialized) {
			freshnessMapInitialized = true;
			return;
		}
		clearTimeout(mapFreshnessTimer);
		mapFreshnessTimer = setTimeout(() => {
			const anyFilter =
				appState.activeCuisines.length > 0 ||
				appState.activeCities.length > 0 ||
				appState.activeSubreddits.length > 0 ||
				appState.freshnessCutoff !== null;
			appState.fitBoundsTarget = (anyFilter ? filteredRestaurants : allRestaurants).filter((r) => r.lat != null && r.lng != null).map((r) => ({ lat: r.lat as number, lng: r.lng as number }));
		}, 250);
		return () => clearTimeout(mapFreshnessTimer);
	});

	onMount(() => {
		viewportWidth = window.innerWidth;
		const onResize = () => {
			viewportWidth = window.innerWidth;
			// Kill the map-pane transition for the duration of the resize so crossing the
			// 1024px breakpoint switches layouts instantly; re-enable once the drag settles.
			suppressMapTransition = true;
			clearTimeout(resizeSettleTimer);
			resizeSettleTimer = setTimeout(() => {
				suppressMapTransition = false;
			}, 200);
		};
		window.addEventListener('resize', onResize, { passive: true });
		return () => {
			window.removeEventListener('resize', onResize);
			clearTimeout(resizeSettleTimer);
		};
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

		const subreddit = params.get('subreddit');
		if (subreddit) appState.activeSubreddits = subreddit.split(',').filter(Boolean);

		const since = params.get('since');
		if (since) {
			const t = Date.parse(since);
			if (!Number.isNaN(t)) appState.freshnessCutoff = t;
		}

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
			const match = allRestaurants.find((r) => r.slug === restaurant);
			if (match) {
				appState.listScrollTarget = match.slug;
				if (match.lat && match.lng) {
					appState.mapTarget = { slug: match.slug, lat: match.lat, lng: match.lng };
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
		if (appState.activeSubreddits.length > 0)
			params.set('subreddit', appState.activeSubreddits.join(','));
		if (appState.sortKey) params.set('sort', appState.sortKey);
		if (appState.sortDirection !== 'desc') params.set('sortdir', appState.sortDirection);
		if (appState.selectedRestaurantSlug) params.set('restaurant', appState.selectedRestaurantSlug);
		if (appState.freshnessCutoff !== null)
			params.set('since', new Date(appState.freshnessCutoff).toISOString().slice(0, 10));

		const qs = params.toString();
		const newUrl = qs ? `?${qs}` : window.location.pathname;

		if (window.location.search !== (qs ? `?${qs}` : '')) {
			replaceState(newUrl, {});
		}
	});
</script>

<svelte:head>
	<title>Best Mom & Pop Restaurants in Orange County | Reddit Community Picks</title>
	<meta
		name="description"
		content={`Explore ${allRestaurants.length} community-recommended mom and pop restaurants in Orange County, CA — curated from ${threadCount} Reddit ${threadCount === 1 ? 'thread' : 'threads'} and ${data.dataset.meta.total_comments_processed} comments.`}
	/>
	<meta name="theme-color" content="#ff4500" />
	<link rel="dns-prefetch" href="https://a.tile.openstreetmap.org" />
	<link rel="dns-prefetch" href="https://b.tile.openstreetmap.org" />
	<link rel="dns-prefetch" href="https://c.tile.openstreetmap.org" />
</svelte:head>

<section class="hero-section">
	<Hero meta={data.dataset.meta} />
</section>

<div class="app-trap" bind:this={appTrapEl}>
	<div class="controls-bar" bind:this={controlsBarEl}>
		<SearchBar restaurants={allRestaurants} {cuisineNames} {cityNames} />
		<FilterBar
			restaurants={allRestaurants}
			{threadSubreddit}
			restaurantsForHistogram={restaurantsBeforeFreshness}
			{dateExtent}
		/>
	</div>
	<div class="content-area">
		<div
			class="map-pane"
			class:portal-expanded={mapExpanded}
			class:no-map-transition={suppressMapTransition}
			onpointerdown={() => {
				if (mapExpanded) return;
				if (typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX_PX) {
					snapMobileShellToTop();
				}
				mapExpanded = true;
			}}
			onkeydown={(e) => {
				if (mapExpanded) return;
				if (e.key !== 'Enter' && e.key !== ' ') return;
				e.preventDefault();
				if (typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX_PX) {
					snapMobileShellToTop();
				}
				mapExpanded = true;
			}}
			role="button"
			tabindex="0"
		>
			{#if mapExpanded}
				<div
					class="portal-backdrop"
					onclick={() => (mapExpanded = false)}
					role="presentation"
				></div>
			{/if}
			<div class="map-interactive-layer">
				<Map restaurants={filteredRestaurants} {mapExpanded} />
			</div>
			{#if mapExpanded}
				<button
					class="map-close-btn"
					onclick={(e) => { e.stopPropagation(); mapExpanded = false; }}
					aria-label="Close map"
				>
					<X size={22} aria-hidden="true" />
				</button>
			{/if}
		</div>
		<div class="list-pane">
			<RestaurantList restaurants={filteredRestaurants} />
		</div>
	</div>
</div>

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

	:global(button),
	:global(a),
	:global([role='button']) {
		touch-action: manipulation;
	}

	:global(*:focus-visible) {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			scroll-behavior: auto !important;
		}
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
		position: relative;
		isolation: isolate;
		overflow: hidden;
	}

	/* While the window is resizing, suppress the map-pane transition so crossing the
	   desktop/mobile breakpoint switches instantly (no jump / full-height / circle morph).
	   Two classes outrank the single-class `.map-pane` rules in both media queries. */
	.map-pane.no-map-transition {
		transition: none !important;
	}

	/* ── Desktop: CSS :has() hover morph (≥ 1024px) ─────────────────────── */
	@media (min-width: 1024px) {
		:global(html) {
			height: 100%;
			overflow: hidden;
		}

		:global(body) {
			height: 100%;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		.hero-section {
			flex-shrink: 0;
		}

		.app-trap {
			position: relative;
			top: auto;
			height: auto;
			min-height: 0;
			flex: 1;
			overflow: hidden;
		}

		.controls-bar {
			overflow: visible;
		}

		.content-area {
			align-items: stretch;
		}

		.map-pane {
			flex-basis: 25%;
			flex-shrink: 0;
			display: flex;
			flex-direction: column;
			position: relative;
			z-index: 0;
			overflow: hidden;
			height: 100%;
			min-height: 0;
			min-width: 0;
			will-change: flex-basis;
			transition: flex-basis 0.4s ease;
		}

		.list-pane {
			flex: 1;
			height: 100%;
			min-width: 0;
			position: relative;
			z-index: 2;
			isolation: isolate;
			margin-left: -48px; /* overlap the map — gives a layered depth effect */
			box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
			overflow: hidden;
			overscroll-behavior: contain;
			background: #fff;
			border-radius: 12px 0 0 0;
			will-change: flex-basis, margin-left;
			transition: flex-basis 0.4s ease, margin-left 0.4s ease;
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

		.map-interactive-layer {
			flex: 1;
			min-height: 0;
			display: flex;
			flex-direction: column;
			position: relative;
			z-index: 0;
		}
	}

	/* ── Mobile: map-pane IS the circular FAB portal (< 1024px) ─────────── */
	@media (max-width: 1023px) {
		:global(html.mobile-map-expanded-lock),
		:global(html.mobile-map-expanded-lock body) {
			overflow: hidden;
			height: 100%;
		}

		.map-pane {
			position: fixed;
			bottom: max(20px, env(safe-area-inset-bottom, 0px));
			right: max(16px, env(safe-area-inset-right, 0px));
			width: clamp(88px, 22vw, 120px);
			height: clamp(88px, 22vw, 120px);
			border-radius: 50%;
			border: 4px solid white;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
			z-index: 1300;
			cursor: pointer;
			overflow: hidden;
			/* Omit `top` so expanded `top: var(--mobile-map-top-offset)` applies immediately (no FAB→sheet tween) */
			transition:
				width 0.4s cubic-bezier(0.4, 0, 0.2, 1),
				height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
				bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1),
				right 0.4s cubic-bezier(0.4, 0, 0.2, 1),
				left 0.4s cubic-bezier(0.4, 0, 0.2, 1),
				border-radius 0.4s cubic-bezier(0.4, 0, 0.2, 1),
				box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.map-pane.portal-expanded {
			top: var(--mobile-map-top-offset, 160px);
			left: max(16px, env(safe-area-inset-left, 0px));
			right: max(16px, env(safe-area-inset-right, 0px));
			bottom: max(16px, env(safe-area-inset-bottom, 0px));
			width: auto;
			height: auto;
			border-radius: 16px;
			cursor: default;
			z-index: 1400;
		}

		.list-pane {
			width: 100%;
			display: flex;
			flex-direction: column;
			min-height: 0;
		}

		/* Block manual scroll / interaction on the list while the map sheet is open */
		.app-trap:has(.map-pane.portal-expanded) .list-pane {
			overflow: hidden !important;
			overscroll-behavior: none;
			touch-action: none;
			pointer-events: none;
		}

		.app-trap:has(.map-pane.portal-expanded) .list-pane :global(.list-scroll) {
			overflow: hidden !important;
			overscroll-behavior: none;
			touch-action: none;
		}

		/* Lives inside .map-pane so it stacks under the map (sibling .app-trap was 1100, so a
		   global-sibling backdrop at 1110 painted over the entire trap including the map). */
		.portal-backdrop {
			position: absolute;
			inset: 0;
			z-index: 0;
			background: rgba(0, 0, 0, 0.4);
			backdrop-filter: blur(4px);
			-webkit-backdrop-filter: blur(4px);
		}

		.map-interactive-layer {
			position: absolute;
			inset: 0;
			z-index: 1;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}

		.map-close-btn {
			position: absolute;
			top: max(12px, env(safe-area-inset-top, 0px));
			right: max(12px, env(safe-area-inset-right, 0px));
			width: 44px;
			height: 44px;
			border-radius: 50%;
			border: none;
			background: rgba(255, 255, 255, 0.92);
			font-size: 1.4rem;
			line-height: 1;
			cursor: pointer;
			z-index: 2;
			display: flex;
			align-items: center;
			justify-content: center;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		}

		/* Expanded map sits below controls; keep shell overflow visible for dropdowns */
		.app-trap:has(.map-pane.portal-expanded) {
			overflow: visible;
		}
		.app-trap:has(.map-pane.portal-expanded) .content-area {
			overflow: visible;
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
