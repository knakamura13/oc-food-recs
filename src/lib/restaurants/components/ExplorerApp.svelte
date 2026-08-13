<script lang="ts">
	import { Maximize2, Minimize2, X } from 'lucide-svelte';
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
		createSliceCache
	} from '$lib/restaurants/filter-restaurants';
	import { SEARCH_DEBOUNCE_MS, scheduleDebounced } from '$lib/debounce';
	import { filterPageRestaurantsWithSearch } from '$lib/restaurants/filter-page-restaurants';
	import { buildPageTitle, buildPageDescription, buildCanonicalShareUrl } from '$lib/restaurants/page-meta';
	import { applyUrlStateSnapshot } from '$lib/restaurants/apply-url-state';
	import { buildSearchParams } from '$lib/restaurants/url-state';
	import { initSavedState, savedState } from '$lib/restaurants/saved-restaurants.svelte';
	import { setLastVisitNow } from '$lib/restaurants/visit-tracker';
	import Hero from '$lib/restaurants/components/Hero.svelte';
	import SearchBar from '$lib/restaurants/components/SearchBar.svelte';
	import FilterBar from '$lib/restaurants/components/FilterBar.svelte';
	import Map from '$lib/restaurants/components/Map.svelte';
	import RestaurantList from '$lib/restaurants/components/RestaurantList.svelte';
	import BackToTop from '$lib/restaurants/components/BackToTop.svelte';
	import type { ExplorerPageData } from '$lib/restaurants/explorer-page-data';

	let { data, routerReady = false }: { data: ExplorerPageData; routerReady?: boolean } = $props();

	const FOCUSABLE_SELECTOR = [
		'a[href]',
		'button:not([disabled])',
		'input:not([disabled])',
		'select:not([disabled])',
		'textarea:not([disabled])',
		'[tabindex]:not([tabindex="-1"])'
	].join(', ');

	function getFocusableElements(container: HTMLElement): HTMLElement[] {
		return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => {
			if (el.closest('[inert]')) return false;
			if (el.closest('[aria-hidden="true"]')) return false;
			return el.getClientRects().length > 0;
		});
	}

	const allRestaurants: Restaurant[] = $derived.by(() =>
		(data.dataset.restaurants as Restaurant[]).map((r) => ({
			...r,
			endorsement_count: r.endorsement_count ?? countEndorsements(r.mentions)
		}))
	);

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
	let prevSavedOnly = $state(false);

	let mapExpanded = $state(false);
	let mapDesktopPinned = $state(false);
	let mapDesktopHovered = $state(false);
	const mapDesktopExpanded = $derived(mapDesktopPinned || mapDesktopHovered);
	let mapOpener = $state<HTMLButtonElement | null>(null);
	let mapCloseButton = $state<HTMLButtonElement | undefined>(undefined);
	let mapPaneEl = $state<HTMLDialogElement | undefined>(undefined);
	let appTrapEl = $state<HTMLDivElement | undefined>(undefined);
	let controlsBarEl = $state<HTMLDivElement | undefined>(undefined);
	/** Subscribed by mobile-map $effect so resize clears scroll lock when crossing the breakpoint */
	let viewportWidth = $state(0);
	// True only while the window is actively resizing; gates off the desktop map-pane transition
	// so crossing the desktop/mobile breakpoint switches layouts instantly.
	let suppressMapTransition = $state(false);
	let resizeSettleTimer: ReturnType<typeof setTimeout> | undefined;

	const MOBILE_MAX_PX = 1023;
	const DESKTOP_MAP_HOVER_OPEN_MS = 300;
	const DESKTOP_MAP_HOVER_CLOSE_MS = 400;
	const FINE_HOVER_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
	let desktopMapHoverOpenTimer: ReturnType<typeof setTimeout> | undefined;
	let desktopMapHoverCloseTimer: ReturnType<typeof setTimeout> | undefined;

	let clientHydrated = $state(false);

	$effect.pre(() => {
		if (typeof window === 'undefined') return;
		applyUrlStateSnapshot(data.urlState ?? {}, data.dataset.restaurants as Restaurant[]);
		clientHydrated = true;
	});

	const selectedRestaurantName = $derived.by(() => {
		const slug = appState.selectedRestaurantSlug;
		if (!slug) return null;
		return allRestaurants.find((r) => r.slug === slug)?.name ?? null;
	});

	const pageTitle = $derived.by(() => {
		if (!clientHydrated) return data.pageMeta.title;
		return buildPageTitle(
			{
				searchQuery: appState.searchQuery,
				activeCuisines: appState.activeCuisines,
				activeCities: appState.activeCities,
				activeSubreddits: appState.activeSubreddits,
				freshnessCutoff: appState.freshnessCutoff,
				freshnessSource: appState.freshnessSource,
				showUnmapped: appState.showUnmapped,
				sortKey: appState.sortKey,
				sortDirection: appState.sortDirection,
				selectedRestaurantSlug: appState.selectedRestaurantSlug
			},
			selectedRestaurantName
		);
	});

	const ogImageUrl = $derived(`${data.pageOrigin}/screenshot.jpeg`);

	const pageDescription = $derived.by(() => {
		if (!clientHydrated) return data.pageMeta.description;
		return buildPageDescription(
			{
				searchQuery: appState.searchQuery,
				activeCuisines: appState.activeCuisines,
				activeCities: appState.activeCities,
				activeSubreddits: appState.activeSubreddits,
				showUnmapped: appState.showUnmapped,
				freshnessCutoff: appState.freshnessCutoff
			},
			allRestaurants,
			data.dataset.meta,
			threadSubreddit
		);
	});

	const shareUrl = $derived.by(() => {
		const state = {
			searchQuery: appState.searchQuery,
			activeCuisines: appState.activeCuisines,
			activeCities: appState.activeCities,
			activeSubreddits: appState.activeSubreddits,
			freshnessCutoff: appState.freshnessCutoff,
			freshnessSource: appState.freshnessSource,
			showUnmapped: appState.showUnmapped,
			sortKey: appState.sortKey,
			sortDirection: appState.sortDirection,
			selectedRestaurantSlug: appState.selectedRestaurantSlug
		};
		if (!clientHydrated) return data.pageMeta.shareUrl;
		const origin = typeof window !== 'undefined' ? window.location.origin : data.pageOrigin;
		const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
		return buildCanonicalShareUrl(origin, pathname, state);
	});

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

	function restoreMapFocus(opener: HTMLButtonElement | null, focusDesktopMap: boolean) {
		void tick().then(() => {
			const canRestoreOpener =
				opener?.isConnected &&
				opener.getClientRects().length > 0 &&
				(!focusDesktopMap || opener.classList.contains('map-link'));
			if (canRestoreOpener) {
				opener.focus();
				return;
			}
			if (!focusDesktopMap) return;
			requestAnimationFrame(() => {
				const desktopMap = document.querySelector<HTMLElement>('.map-container');
				if (desktopMap?.isConnected && desktopMap.getClientRects().length > 0) {
					if (desktopMap.tabIndex < 0) desktopMap.tabIndex = 0;
					desktopMap.focus({ preventScroll: true });
				}
			});
		});
	}

	function openMobileMap(opener: HTMLButtonElement) {
		if (!isMobileViewport()) return;
		mapOpener = opener;
		snapMobileShellToTop();
		mapExpanded = true;
	}

	function closeMobileMap({ focusDesktopMap = false }: { focusDesktopMap?: boolean } = {}) {
		if (!mapExpanded && !mapPaneEl?.open) return;
		const opener = mapOpener;
		mapExpanded = false;
		mapOpener = null;
		if (mapPaneEl?.open) {
			mapPaneEl.close();
		}
		restoreMapFocus(opener, focusDesktopMap);
	}

	function handleMapDialogClose() {
		if (!mapExpanded) return;
		const opener = mapOpener;
		mapExpanded = false;
		mapOpener = null;
		restoreMapFocus(opener, false);
	}

	function isMapDialogTabTrapActive() {
		// Desktop reuses this <dialog> in-flow while it stays closed (`open` is false).
		// Only wrap Tab when the sheet is actually modal so sequential focus can leave
		// the map for the expand pin, sort bar, and rows (WCAG 2.1.2).
		return Boolean(mapPaneEl?.open) || (mapExpanded && isMobileViewport());
	}

	function handleMapDialogKeydown(event: KeyboardEvent) {
		// Native <dialog> handles Escape; Chrome still needs a Tab wrap while
		// `showModal()` is up, or focus jumps to <body> from the last sheet control.
		if (event.key !== 'Tab' || !mapPaneEl) return;
		if (!isMapDialogTabTrapActive()) return;

		const focusables = getFocusableElements(mapPaneEl);
		if (focusables.length === 0) {
			event.preventDefault();
			return;
		}

		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		const activeInside = active instanceof HTMLElement && mapPaneEl.contains(active);

		if (event.shiftKey) {
			if (!activeInside || active === first) {
				event.preventDefault();
				last.focus();
			}
			return;
		}

		if (!activeInside || active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function toggleMobileMap(opener: HTMLButtonElement) {
		if (mapExpanded) {
			closeMobileMap();
		} else {
			openMobileMap(opener);
		}
	}

	function clearDesktopMapHoverTimers() {
		clearTimeout(desktopMapHoverOpenTimer);
		clearTimeout(desktopMapHoverCloseTimer);
		desktopMapHoverOpenTimer = undefined;
		desktopMapHoverCloseTimer = undefined;
	}

	function collapseDesktopMap() {
		clearDesktopMapHoverTimers();
		mapDesktopPinned = false;
		mapDesktopHovered = false;
	}

	function hasFineHoverPointer() {
		return typeof window !== 'undefined' && window.matchMedia(FINE_HOVER_POINTER_QUERY).matches;
	}

	function canHoverWidenDesktopMap(event: PointerEvent) {
		if (isMobileViewport()) return false;
		if (event.pointerType === 'touch') return false;
		return hasFineHoverPointer();
	}

	function handleDesktopMapPointerEnter(event: PointerEvent) {
		if (!canHoverWidenDesktopMap(event)) return;
		clearTimeout(desktopMapHoverCloseTimer);
		desktopMapHoverCloseTimer = undefined;
		if (mapDesktopHovered) return;
		clearTimeout(desktopMapHoverOpenTimer);
		desktopMapHoverOpenTimer = setTimeout(() => {
			mapDesktopHovered = true;
			desktopMapHoverOpenTimer = undefined;
		}, DESKTOP_MAP_HOVER_OPEN_MS);
	}

	function handleDesktopMapPointerLeave() {
		if (isMobileViewport()) return;
		clearTimeout(desktopMapHoverOpenTimer);
		desktopMapHoverOpenTimer = undefined;
		clearTimeout(desktopMapHoverCloseTimer);
		desktopMapHoverCloseTimer = setTimeout(() => {
			mapDesktopHovered = false;
			desktopMapHoverCloseTimer = undefined;
		}, DESKTOP_MAP_HOVER_CLOSE_MS);
	}

	function toggleDesktopMapExpanded() {
		if (isMobileViewport()) return;
		mapDesktopPinned = !mapDesktopPinned;
		if (mapDesktopPinned) {
			clearTimeout(desktopMapHoverCloseTimer);
			desktopMapHoverCloseTimer = undefined;
		}
	}

	function handleDesktopMapEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (isMobileViewport()) return;
		if (!mapDesktopPinned && !mapDesktopHovered) return;
		const target = event.target;
		if (target instanceof HTMLElement) {
			if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
				return;
			}
		}
		if (document.querySelector('.dropdown-trigger[aria-expanded="true"]')) return;
		event.preventDefault();
		collapseDesktopMap();
	}

	// Keep the native <dialog> modal state in sync with mapExpanded + viewport.
	// showModal() provides the focus trap and Escape-to-close; close() tears it down.
	$effect(() => {
		const dialog = mapPaneEl;
		if (!dialog) return;

		const wantModal = mapExpanded && isMobileViewport();
		try {
			if (wantModal) {
				if (!dialog.open) {
					dialog.showModal();
					void tick().then(() => mapCloseButton?.focus());
				}
			} else if (dialog.open) {
				dialog.close();
			}
		} catch {
			// jsdom and older engines may not implement HTMLDialogElement.showModal.
		}
	});

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

	// Keep the search caret live; only the page list/virtualizer waits for this copy.
	let debouncedSearchQuery = $state('');
	let searchDebouncePrimed = false;
	$effect.pre(() => {
		if (searchDebouncePrimed) return;
		searchDebouncePrimed = true;
		debouncedSearchQuery = appState.searchQuery;
	});
	$effect(() => {
		const q = appState.searchQuery;
		if (q === debouncedSearchQuery) return;
		if (!q.trim()) {
			debouncedSearchQuery = q;
			return;
		}
		return scheduleDebounced(() => {
			debouncedSearchQuery = q;
		}, SEARCH_DEBOUNCE_MS);
	});

	const pageFilterState = $derived({
		activeSubreddits: appState.activeSubreddits,
		activeCuisines: appState.activeCuisines,
		activeCities: appState.activeCities,
		showUnmapped: appState.showUnmapped,
		freshnessCutoff: appState.freshnessCutoff,
		searchQuery: debouncedSearchQuery
	});

	// "Saved" narrows the population before the shared filters so the histogram,
	// counts, and map all reflect only the saved set while it's active.
	const baseRestaurants = $derived.by(() => {
		if (!appState.showSavedOnly) return allRestaurants;
		const saved = new Set(savedState.slugs);
		return allRestaurants.filter((r) => saved.has(r.slug));
	});

	const pageFilterResult = $derived.by(() =>
		filterPageRestaurantsWithSearch(baseRestaurants, pageFilterState, {
			threadSubreddit,
			dateExtent,
			subredditSliceCache,
			recencySliceCache
		})
	);

	const restaurantsBeforeFreshness = $derived(pageFilterResult.beforeFreshness);
	const filteredRestaurants = $derived(pageFilterResult.filtered);

	function hasAnyExplorerFilter() {
		return (
			appState.searchQuery.trim().length > 0 ||
			appState.activeCuisines.length > 0 ||
			appState.activeCities.length > 0 ||
			appState.activeSubreddits.length > 0 ||
			appState.showSavedOnly ||
			appState.freshnessCutoff !== null
		);
	}

	function fitBoundsForPopulation(filtered: Restaurant[], all: Restaurant[]) {
		const restaurants = hasAnyExplorerFilter() ? filtered : all;
		return restaurants
			.filter((r) => r.lat != null && r.lng != null)
			.map((r) => ({ lat: r.lat as number, lng: r.lng as number }));
	}

	// Trigger fitBounds when filters change
	$effect(() => {
		const cuisineKey = appState.activeCuisines.join(',');
		const cityKey = appState.activeCities.join(',');
		const subredditKey = appState.activeSubreddits.join(',');
		const savedKey = appState.showSavedOnly;
		const currentKey = `${cuisineKey}|${cityKey}|${subredditKey}|${savedKey}`;
		const prevKey = `${prevCuisines}|${prevCities}|${prevSubreddits}|${prevSavedOnly}`;

		if (currentKey !== prevKey) {
			prevCuisines = cuisineKey;
			prevCities = cityKey;
			prevSubreddits = subredditKey;
			prevSavedOnly = savedKey;

			appState.fitBoundsTarget = fitBoundsForPopulation(filteredRestaurants, allRestaurants);
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
			appState.fitBoundsTarget = fitBoundsForPopulation(filteredRestaurants, allRestaurants);
		}, 250);
		return () => clearTimeout(mapFreshnessTimer);
	});

	// Search typing can be rapid; debounce map re-zoom like recency so it settles after pauses.
	let searchMapInitialized = false;
	let mapSearchTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const searchKey = appState.searchQuery.trim();
		void searchKey;
		if (!searchMapInitialized) {
			searchMapInitialized = true;
			if (searchKey.length > 0) {
				clearTimeout(mapSearchTimer);
				mapSearchTimer = setTimeout(() => {
					appState.fitBoundsTarget = fitBoundsForPopulation(filteredRestaurants, allRestaurants);
				}, 250);
			}
			return () => clearTimeout(mapSearchTimer);
		}
		clearTimeout(mapSearchTimer);
		mapSearchTimer = setTimeout(() => {
			appState.fitBoundsTarget = fitBoundsForPopulation(filteredRestaurants, allRestaurants);
		}, 250);
		return () => clearTimeout(mapSearchTimer);
	});

	onMount(() => {
		initSavedState();
		viewportWidth = window.innerWidth;
		let wasMobileViewport = window.innerWidth <= MOBILE_MAX_PX;
		const onVisChange = () => {
			if (document.visibilityState === 'hidden') setLastVisitNow();
		};
		window.addEventListener('beforeunload', setLastVisitNow);
		document.addEventListener('visibilitychange', onVisChange);
		const onResize = () => {
			const nextWidth = window.innerWidth;
			const nextIsMobile = nextWidth <= MOBILE_MAX_PX;
			const crossedToDesktop = wasMobileViewport && !nextIsMobile;
			wasMobileViewport = nextIsMobile;
			viewportWidth = nextWidth;
			if (crossedToDesktop && mapExpanded) {
				closeMobileMap({ focusDesktopMap: true });
			}
			if (nextIsMobile) {
				collapseDesktopMap();
			}
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
			window.removeEventListener('beforeunload', setLastVisitNow);
			document.removeEventListener('visibilitychange', onVisChange);
			clearTimeout(resizeSettleTimer);
			clearDesktopMapHoverTimers();
		};
	});

	// SvelteKit's replaceState throws (dev guard) when called before the router has
	// initialized, and the initial effect flush happens during hydration — before that.
	// The throw also aborts the rest of the flush (the list's initial sort never
	// activates), so gate URL writes until +page.svelte arms `routerReady` via
	// afterNavigate. That subscription cannot live here: Kit does not replay the
	// initial `'enter'` navigation for components that missed it behind {#await}.

	// Sync state -> URL params
	$effect(() => {
		if (!routerReady) return;

		const params = buildSearchParams({
			searchQuery: appState.searchQuery,
			activeCuisines: appState.activeCuisines,
			activeCities: appState.activeCities,
			activeSubreddits: appState.activeSubreddits,
			freshnessCutoff: appState.freshnessCutoff,
			freshnessSource: appState.freshnessSource,
			showUnmapped: appState.showUnmapped,
			sortKey: appState.sortKey,
			sortDirection: appState.sortDirection,
			selectedRestaurantSlug: appState.selectedRestaurantSlug
		});

		const qs = params.toString();

		if (window.location.search !== (qs ? `?${qs}` : '')) {
			replaceState(qs ? `?${qs}` : window.location.pathname, {});
		}
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={shareUrl} />
	<meta property="og:image" content={ogImageUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={ogImageUrl} />
	<meta name="theme-color" content="#ff4500" />
	<link rel="dns-prefetch" href="https://a.tile.openstreetmap.org" />
	<link rel="dns-prefetch" href="https://b.tile.openstreetmap.org" />
	<link rel="dns-prefetch" href="https://c.tile.openstreetmap.org" />
</svelte:head>

<svelte:window onkeydown={handleDesktopMapEscape} />

<main>
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
				unmappedCount={pageFilterResult.unmappedCount}
				{mapExpanded}
				onMapToggle={toggleMobileMap}
			/>
		</div>
		<div class="content-area">
			<dialog
				class="map-pane"
				class:portal-expanded={mapExpanded}
				class:desktop-expanded={mapDesktopExpanded}
				class:no-map-transition={suppressMapTransition}
				id="restaurant-map-panel"
				bind:this={mapPaneEl}
				aria-modal={mapExpanded && isMobileViewport() ? 'true' : undefined}
				aria-label={mapExpanded && isMobileViewport() ? 'Restaurant map' : undefined}
				aria-hidden={isMobileViewport() && !mapExpanded ? 'true' : undefined}
				inert={isMobileViewport() && !mapExpanded ? true : undefined}
				onclose={handleMapDialogClose}
				onkeydown={handleMapDialogKeydown}
				onpointerenter={handleDesktopMapPointerEnter}
				onpointerleave={handleDesktopMapPointerLeave}
			>
				<div class="map-interactive-layer">
					<Map restaurants={filteredRestaurants} {mapExpanded} />
				</div>
				{#if mapExpanded}
					<button
						class="map-close-btn"
						bind:this={mapCloseButton}
						onclick={(event) => {
							event.stopPropagation();
							closeMobileMap();
						}}
						aria-label="Close map"
					>
						<X size={22} aria-hidden="true" />
					</button>
				{/if}
			</dialog>
			{#if !isMobileViewport()}
				<button
					type="button"
					class="map-expand-toggle"
					aria-pressed={mapDesktopPinned}
					aria-label={mapDesktopPinned ? 'Narrow map' : 'Widen map'}
					title={mapDesktopPinned ? 'Narrow map' : 'Widen map'}
					onclick={toggleDesktopMapExpanded}
				>
					{#if mapDesktopPinned}
						<Minimize2 size={16} aria-hidden="true" />
					{:else}
						<Maximize2 size={16} aria-hidden="true" />
					{/if}
				</button>
			{/if}
			<div class="list-pane" inert={mapExpanded && isMobileViewport() ? true : undefined}>
				<RestaurantList
					restaurants={filteredRestaurants}
					onShowOnMap={openMobileMap}
				/>
			</div>
		</div>
	</div>

	{#if !mapExpanded || !isMobileViewport()}
		<BackToTop />
	{/if}
</main>

<style>
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
		padding-top: env(safe-area-inset-top, 0px);
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: rgba(255, 255, 255, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		z-index: 1100;
		box-shadow: 0 4px 24px -8px rgba(62, 44, 35, 0.1);
	}

	/* Controls bar — no overflow set so dropdowns escape freely into the viewport */
	.controls-bar {
		flex-shrink: 0;
		position: relative;
		z-index: 1200; /* above map portal (1050) and backdrop (1040) */
	}

	.list-pane {
		container-type: inline-size;
		container-name: list-pane;
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
	.map-pane.no-map-transition,
	.map-pane.no-map-transition :global(.locate-me-btn),
	.map-pane.no-map-transition :global(.location-error),
	.map-pane.no-map-transition :global(.leaflet-right) {
		transition: none !important;
	}

	/* <dialog> UA chrome (centered, bordered, display:none when closed). Desktop
	   shows the closed dialog in-flow; mobile uses showModal() for the sheet. */
	dialog.map-pane {
		margin: 0;
		padding: 0;
		border: none;
		width: auto;
		height: auto;
		max-width: none;
		max-height: none;
		background: transparent;
		color: inherit;
		position: relative;
	}

	dialog.map-pane::backdrop {
		background: transparent;
		pointer-events: none;
	}

	/* ── Desktop: pin toggle + hover enhancement (≥ 1024px) ─────────────── */
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

		main {
			flex: 1;
			min-height: 0;
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
			--map-list-overlap: 48px;
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
			transition: flex-basis 0.25s ease;
		}

		.list-pane {
			flex: 1;
			height: 100%;
			min-width: 0;
			position: relative;
			z-index: 2;
			isolation: isolate;
			margin-left: calc(-1 * var(--map-list-overlap)); /* overlap the map — layered depth */
			box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
			overflow: hidden;
			overscroll-behavior: contain;
			background: #fff;
			border-radius: 12px 0 0 0;
			will-change: flex-basis, margin-left;
			transition: flex-basis 0.25s ease, margin-left 0.25s ease;
		}

		/* Expanded: map grows over the list (pinned click/keyboard or hover) */
		.content-area:has(.map-pane.desktop-expanded) .map-pane {
			flex-basis: 33.33%;
		}

		.content-area:has(.map-pane.desktop-expanded) .list-pane {
			flex-basis: 66.67%;
			margin-left: 0;
			box-shadow: none;
		}

		/* Collapsed list overlaps the map; keep locate (and right-edge Leaflet chrome)
		   in the visible strip so widen is more map, not a hunt for buried buttons. */
		.map-pane:not(.desktop-expanded) :global(.locate-me-btn),
		.map-pane:not(.desktop-expanded) :global(.location-error) {
			right: calc(var(--map-list-overlap) + 10px);
		}

		.map-pane:not(.desktop-expanded) :global(.leaflet-right) {
			right: var(--map-list-overlap);
		}

		.map-pane :global(.leaflet-right) {
			transition: right 0.25s ease;
		}

		.map-interactive-layer {
			flex: 1;
			min-height: 0;
			display: flex;
			flex-direction: column;
			position: relative;
			z-index: 0;
		}

		.map-expand-toggle {
			position: absolute;
			bottom: 12px;
			left: 12px;
			z-index: 3;
			width: 44px;
			height: 44px;
			min-width: 44px;
			min-height: 44px;
			padding: 0;
			border: 2px solid rgba(0, 0, 0, 0.2);
			border-radius: 6px;
			background: #fffcf8;
			color: #3e2c23;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			box-shadow: 0 1px 5px rgba(0, 0, 0, 0.15);
			transition: background 0.15s, color 0.15s, border-color 0.15s;
		}

		.map-expand-toggle:hover,
		.map-expand-toggle[aria-pressed='true'] {
			background: #fff0eb;
			color: #ff4500;
			border-color: rgba(0, 0, 0, 0.3);
		}

		.map-expand-toggle:active {
			transform: scale(0.96);
		}

		@media (prefers-reduced-motion: reduce) {
			.map-pane,
			.list-pane,
			.map-expand-toggle,
			.map-pane :global(.leaflet-right) {
				transition: none;
			}
		}
	}

	/* ── Mobile: explicit control opens the map sheet (< 1024px) ───────── */
	@media (max-width: 1023px) {
		:global(html.mobile-map-expanded-lock),
		:global(html.mobile-map-expanded-lock body) {
			overflow: hidden;
			height: 100%;
		}

		.map-pane {
			display: none;
		}

		.map-pane.portal-expanded {
			display: block;
			position: fixed;
			top: var(--mobile-map-top-offset, 160px);
			left: max(16px, env(safe-area-inset-left, 0px));
			right: max(16px, env(safe-area-inset-right, 0px));
			bottom: max(16px, env(safe-area-inset-bottom, 0px));
			width: auto;
			height: auto;
			border-radius: 16px;
			border: 4px solid white;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
			z-index: 1400;
			overflow: hidden;
			overscroll-behavior: contain;
		}

		.map-pane.portal-expanded .map-interactive-layer {
			overscroll-behavior: contain;
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
			color: #3e2c23;
			font-size: 1.4rem;
			line-height: 1;
			cursor: pointer;
			z-index: 2;
			display: flex;
			align-items: center;
			justify-content: center;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
			transition: background 0.15s, color 0.15s;
		}

		.map-close-btn:hover {
			background: #fff0eb;
			color: #ff4500;
		}

		.map-close-btn:active {
			transform: scale(0.96);
			background: #ffe4d6;
		}

		/* Expanded map sits below controls; keep shell overflow visible for dropdowns */
		.app-trap:has(.map-pane.portal-expanded) {
			overflow: visible;
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
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
	}

	@media (max-width: 1023px) {
		.map-expand-toggle {
			display: none;
		}
	}

	/* Short/narrow viewports (phone at ~200% zoom): a sticky 100dvh trap plus
	   overflow:hidden clips `.list-scroll` under the non-shrinking controls.
	   Let the document scroll instead. Desktop ≥1024 keeps the split pane. */
	@media (max-width: 1023px) and (max-height: 720px) {
		.app-trap {
			height: auto;
			min-height: 0;
		}

		.content-area {
			overflow: visible;
			flex: 1 0 auto;
			min-height: 12rem;
		}

		.list-pane {
			min-height: 12rem;
		}

		.list-pane :global(.restaurant-list) {
			height: auto;
			min-height: 12rem;
		}

		.list-pane :global(.list-scroll) {
			min-height: 12rem;
		}
	}
</style>
