<script lang="ts">
	import { Map as MapIcon, X } from 'lucide-svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import type { Restaurant, SortKey, ThreadSummary } from '$lib/restaurants/types';
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
	import {
		filterPageFacetPopulations,
		filterPageRestaurantsWithSearch
	} from '$lib/restaurants/filter-page-restaurants';
	import { coordsForFitBounds, restaurantsInBounds, type MapViewBounds } from '$lib/restaurants/explorer-bounds';
	import {
		buildPageTitle,
		buildPageDescription,
		buildCanonicalShareUrl,
		DEFAULT_TITLE,
		type PageMeta
	} from '$lib/restaurants/page-meta';
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
	import { trackEvent } from '$lib/events';
	import { scheduleCommentSearch, type CommentSearchHit } from '$lib/restaurants/comment-search';
	import { searchRankBySlug } from '$lib/restaurants/search-restaurants';

	let {
		data,
		initialPageMeta = {
			title: DEFAULT_TITLE,
			description: 'Explore community-recommended mom and pop restaurants in Orange County.',
			shareUrl: data.pageOrigin
		},
		onPageMetaChange,
		routerReady = false
	}: {
		data: ExplorerPageData;
		initialPageMeta?: PageMeta;
		onPageMetaChange?: (pageMeta: PageMeta) => void;
		routerReady?: boolean;
	} = $props();

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

	const threadsById = $derived.by(() => {
		const lookup: Record<string, ThreadSummary> = {};
		for (const t of data.dataset.meta.source_threads) lookup[t.id] = t;
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
	let prevRadius = $state('');

	let mapExpanded = $state(false);
	// Mirrors the short-phone @media block below: there the page scrolls, not `.list-scroll`.
	const SHORT_PHONE_QUERY = '(max-width: 1023px) and (max-height: 720px)';
	let shortPhone = $state(typeof window !== 'undefined' && window.matchMedia(SHORT_PHONE_QUERY).matches);
	// Phones: the open map sits behind a draggable list sheet that snaps to three heights.
	type SheetState = 'peek' | 'half' | 'full';
	const SHEET_ORDER: SheetState[] = ['peek', 'half', 'full'];
	/** A full sheet stops this far below the chips, leaving room for Close map and locate. */
	const SHEET_FULL_GAP_PX = 76;
	let sheetState = $state<SheetState>('peek');
	let sheetDragPx = $state<number | null>(null);
	/** What the open map shows right now; the list follows it instead of a Search this area button. */
	let mapBounds = $state<MapViewBounds | null>(null);
	/**
	 * Bumped when the list re-scopes because the map moved for a selection (pin tap, row tap,
	 * Show on map). Only then does the list bring the open row back into view; a visitor who
	 * scrolled away from it and pans keeps their scroll position.
	 */
	let revealOpenRowRequest = $state(0);

	function handleMapBoundsChange(bounds: MapViewBounds, { selectionMoved }: { selectionMoved: boolean }) {
		mapBounds = bounds;
		if (selectionMoved) revealOpenRowRequest += 1;
	}
	let viewportHeight = $state(0);
	let controlsHeight = $state(0);
	let mapDesktopHovered = $state(false);
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
	const DESKTOP_MAP_HOVER_OPEN_MS = 0;
	const DESKTOP_MAP_HOVER_CLOSE_MS = 400;
	const FINE_HOVER_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
	let desktopMapHoverOpenTimer: ReturnType<typeof setTimeout> | undefined;
	let desktopMapHoverCloseTimer: ReturnType<typeof setTimeout> | undefined;

	let clientHydrated = $state(false);

	$effect.pre(() => {
		if (typeof window === 'undefined') return;
		const urlState = data.urlState ?? {};
		const restaurants = data.dataset.restaurants as Restaurant[];
		untrack(() => applyUrlStateSnapshot(urlState, restaurants));
		clientHydrated = true;
	});

	const selectedRestaurantName = $derived.by(() => {
		const slug = appState.selectedRestaurantSlug;
		if (!slug) return null;
		return allRestaurants.find((r) => r.slug === slug)?.name ?? null;
	});

	const pageTitle = $derived.by(() => {
		if (!clientHydrated) return initialPageMeta.title;
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

	const pageDescription = $derived.by(() => {
		if (!clientHydrated) return initialPageMeta.description;
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
		if (!clientHydrated) return initialPageMeta.shareUrl;
		const origin = typeof window !== 'undefined' ? window.location.origin : data.pageOrigin;
		const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
		return buildCanonicalShareUrl(origin, pathname, state);
	});

	$effect(() => {
		onPageMetaChange?.({ title: pageTitle, description: pageDescription, shareUrl });
	});

	function isMobileViewport() {
		const w = viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : MOBILE_MAX_PX + 1);
		return w <= MOBILE_MAX_PX;
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
		trackEvent('map_opened');
		mapOpener = opener;
		snapMobileShellToTop();
		sheetState = appState.selectedRestaurantSlug ? 'half' : 'peek';
		sheetDragPx = null;
		mapBounds = null;
		mapExpanded = true;
	}

	function closeMobileMap({ focusDesktopMap = false }: { focusDesktopMap?: boolean } = {}) {
		if (!mapExpanded && !mapPaneEl?.open) return;
		const opener = mapOpener;
		mapExpanded = false;
		mapBounds = null;
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

	function sheetHeights() {
		const vh = viewportHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);
		// The chips are fixed over the map, so their bottom edge already includes the safe area.
		const chipsBottom = controlsBarEl?.getBoundingClientRect().bottom || controlsHeight + 20;
		// The floor is low on purpose: a landscape phone has little room, and a taller sheet
		// would cover Close map and locate at full.
		const full = Math.max(vh - chipsBottom - SHEET_FULL_GAP_PX, 150);
		const half = Math.round(Math.min(vh * 0.55, Math.max(full - 60, 110)));
		const peek = Math.round(Math.min(Math.max(vh * 0.32, 200), 300, Math.max(half - 60, 80)));
		return { peek, half, full };
	}

	const sheetHeightPx = $derived.by(() => {
		void viewportHeight;
		void controlsHeight;
		return sheetDragPx ?? sheetHeights()[sheetState];
	});

	function setSheetState(next: SheetState) {
		sheetState = next;
		sheetDragPx = null;
	}

	function stepSheet(direction: 1 | -1) {
		const index = SHEET_ORDER.indexOf(sheetState) + direction;
		setSheetState(SHEET_ORDER[Math.min(Math.max(index, 0), SHEET_ORDER.length - 1)]);
	}

	let sheetDrag: {
		startY: number;
		startHeight: number;
		/** Snap stops measured once per drag, so moves do not re-read layout. */
		heights: Record<SheetState, number>;
		moved: boolean;
		lastY: number;
		lastT: number;
		velocity: number;
	} | null = null;
	let sheetSuppressClick = false;
	/** A fling only counts if the finger was still moving this recently before release. */
	const SHEET_FLING_MAX_IDLE_MS = 100;

	/**
	 * The pane starts a drag from its header, and from anywhere on it while collapsed (the rows
	 * do not scroll then). Move and release are tracked on the window instead of capturing the
	 * pointer, so a tap on a row still reaches the row and a fast mouse drag that leaves the
	 * pane keeps working.
	 */
	function handleSheetPointerDown(event: PointerEvent) {
		if (event.button > 0 || !(event.target instanceof Element)) return;
		sheetSuppressClick = false;
		if (sheetState !== 'peek' && !event.target.closest('.sheet-grabber, .sheet-summary')) return;
		sheetDrag = {
			startY: event.clientY,
			startHeight: sheetHeightPx,
			heights: sheetHeights(),
			moved: false,
			lastY: event.clientY,
			lastT: event.timeStamp,
			velocity: 0
		};
		window.addEventListener('pointermove', handleSheetPointerMove);
		window.addEventListener('pointerup', handleSheetPointerEnd);
		window.addEventListener('pointercancel', handleSheetPointerEnd);
	}

	function handleSheetPointerMove(event: PointerEvent) {
		if (!sheetDrag) return;
		const delta = sheetDrag.startY - event.clientY;
		if (!sheetDrag.moved) {
			if (Math.abs(delta) < 6) return;
			sheetDrag.moved = true;
		}
		const dt = event.timeStamp - sheetDrag.lastT;
		if (dt > 0) sheetDrag.velocity = (sheetDrag.lastY - event.clientY) / dt;
		sheetDrag.lastY = event.clientY;
		sheetDrag.lastT = event.timeStamp;
		const { peek, full } = sheetDrag.heights;
		sheetDragPx = Math.min(Math.max(sheetDrag.startHeight + delta, peek), full);
	}

	function handleSheetPointerEnd(event: PointerEvent) {
		const drag = sheetDrag;
		sheetDrag = null;
		window.removeEventListener('pointermove', handleSheetPointerMove);
		window.removeEventListener('pointerup', handleSheetPointerEnd);
		window.removeEventListener('pointercancel', handleSheetPointerEnd);
		if (!drag || !drag.moved) return;
		// A drag can still end in a click on what was pressed (on touch, sometimes a task later);
		// swallow that one click so release does not also cycle the sheet or open a row. The
		// next press clears it.
		sheetSuppressClick = true;
		if (event.type === 'pointercancel') {
			setSheetState(sheetState);
			return;
		}
		const heights = drag.heights;
		// Project forward a little so a flick lands on the next stop; a press that came to
		// rest before release is not a flick.
		const velocity = event.timeStamp - drag.lastT > SHEET_FLING_MAX_IDLE_MS ? 0 : drag.velocity;
		const projected = (sheetDragPx ?? drag.startHeight) + velocity * 180;
		let best: SheetState = 'peek';
		for (const state of SHEET_ORDER) {
			if (Math.abs(heights[state] - projected) < Math.abs(heights[best] - projected)) best = state;
		}
		setSheetState(best);
	}

	function handleSheetClickCapture(event: MouseEvent) {
		// Keyboard activation (detail 0) never follows a drag.
		if (!sheetSuppressClick || event.detail === 0) return;
		sheetSuppressClick = false;
		event.preventDefault();
		event.stopPropagation();
	}

	function handleSheetClick() {
		if (sheetState === 'full') setSheetState('peek');
		else stepSheet(1);
	}

	function handleSheetKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			stepSheet(1);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			stepSheet(-1);
		}
	}

	// Tapping a pin selects its row; lift a collapsed sheet so the row is readable.
	let lastSelectedSlug: string | null = null;
	$effect(() => {
		const slug = appState.selectedRestaurantSlug;
		const expanded = mapExpanded;
		const changed = slug !== lastSelectedSlug;
		lastSelectedSlug = slug;
		if (changed && slug && expanded && untrack(() => sheetState) === 'peek') setSheetState('half');
	});

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
		desktopMapHoverOpenTimer = undefined;
		if (DESKTOP_MAP_HOVER_OPEN_MS <= 0) {
			mapDesktopHovered = true;
			return;
		}
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

	function handleDesktopMapEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (isMobileViewport()) {
			// The map is no longer a modal dialog, so Escape no longer closes it natively.
			if (!mapExpanded) return;
			const target = event.target;
			if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
			if (document.querySelector('.dropdown-trigger[aria-expanded="true"]')) return;
			event.preventDefault();
			closeMobileMap();
			return;
		}
		if (!mapDesktopHovered) return;
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

	// Keep the native <dialog> open state in sync with mapExpanded + viewport. On phones
	// it opens non-modal (show()) so the list sheet and filter chips stay usable over it.
	$effect(() => {
		const dialog = mapPaneEl;
		if (!dialog) return;

		const wantModal = mapExpanded && isMobileViewport();
		try {
			if (wantModal) {
				if (!dialog.open) {
					dialog.show();
					void tick().then(() => mapCloseButton?.focus());
				}
			} else if (dialog.open) {
				dialog.close();
			}
		} catch {
			// jsdom and older engines may not implement HTMLDialogElement.show.
		}
	});

	// The full-screen mobile dialog locks document scrolling until it closes.
	$effect(() => {
		if (typeof window === 'undefined') return;

		const expanded = mapExpanded;
		const _vw = viewportWidth;
		const mobile = isMobileViewport();

		if (!expanded || !mobile) {
			document.documentElement.classList.remove('mobile-map-expanded-lock');
			return;
		}
		document.documentElement.classList.add('mobile-map-expanded-lock');

		return () => {
			document.documentElement.classList.remove('mobile-map-expanded-lock');
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

	// Searching switches the list to Relevance; clearing the search restores the prior sort.
	let sortBeforeSearch: { key: SortKey; direction: 'asc' | 'desc' } | null = null;
	let hadSearchQuery: boolean | null = null;
	$effect(() => {
		const hasQuery = appState.searchQuery.trim().length > 0;
		untrack(() => {
			if (hadSearchQuery !== null && hasQuery !== hadSearchQuery) {
				if (hasQuery) {
					if (appState.sortKey !== 'relevance') {
						sortBeforeSearch = { key: appState.sortKey, direction: appState.sortDirection };
						appState.sortKey = 'relevance';
						appState.sortDirection = 'desc';
					}
				} else {
					if (appState.sortKey === 'relevance') {
						const previous = sortBeforeSearch?.key === 'distance' && !appState.userLocation
							? null : sortBeforeSearch;
						appState.sortKey = previous?.key ?? 'score';
						appState.sortDirection = previous?.direction ?? 'desc';
					}
					sortBeforeSearch = null;
				}
			}
			hadSearchQuery = hasQuery;
		});
	});

	let commentMatches = $state<CommentSearchHit[]>([]);
	let commentSearchStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	$effect(() => {
		const query = appState.searchQuery.trim();
		commentMatches = [];
		commentSearchStatus = query ? 'loading' : 'idle';
		if (!query) return;
		if (query.length > 160) {
			commentSearchStatus = 'error';
			return;
		}
		return scheduleCommentSearch(query, (matches) => {
			commentMatches = matches;
			commentSearchStatus = 'ready';
		}, () => { commentSearchStatus = 'error'; });
	});

	const pageFilterState = $derived({
		activeSubreddits: appState.activeSubreddits,
		activeCuisines: appState.activeCuisines,
		activeCities: appState.activeCities,
		showUnmapped: appState.showUnmapped,
		freshnessCutoff: appState.freshnessCutoff,
		userLocation: appState.userLocation,
		radiusMiles: appState.radiusMiles,
		searchQuery: debouncedSearchQuery,
		commentMatches
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

	// Facet menus count what each option would return given every OTHER active filter.
	const facetPopulations = $derived.by(() =>
		filterPageFacetPopulations(baseRestaurants, pageFilterState, {
			threadSubreddit,
			dateExtent,
			subredditSliceCache,
			recencySliceCache
		})
	);

	const restaurantsBeforeFreshness = $derived(pageFilterResult.beforeFreshness);
	const filteredRestaurants = $derived(pageFilterResult.filtered);
	// Map open on a phone: the list shows only what is in the visible map area. The map keeps
	// every filtered pin and fits to the full filtered set, so the two never chase each other.
	const listRestaurants = $derived(
		mapExpanded && mapBounds
			? restaurantsInBounds(filteredRestaurants, mapBounds, { keepUnmapped: appState.showUnmapped })
			: filteredRestaurants
	);
	// The list counts what shows above the sheet at its lowest stop. Using the live sheet height
	// instead would make the list shrink whenever the visitor pulls the sheet up to read it.
	const mapVisibleBand = $derived.by(() => {
		void controlsHeight;
		void viewportHeight;
		const chipsBottom = controlsBarEl?.getBoundingClientRect().bottom ?? controlsHeight;
		return { top: chipsBottom, bottom: (viewportHeight || window.innerHeight) - sheetHeights().peek };
	});
	const areaScoped = $derived(mapExpanded && mapBounds !== null);
	// Only body-only matches get the second-tier label; existing Fuse matches retain precedence.
	const visibleCommentMatches = $derived.by(() => {
		const nameRanks = searchRankBySlug(allRestaurants, debouncedSearchQuery);
		const visible = new Set(filteredRestaurants.map((restaurant) => restaurant.slug));
		return commentMatches.filter((match) => visible.has(match.slug) && !nameRanks?.has(match.slug));
	});
	const commentQuotes = $derived(Object.fromEntries(visibleCommentMatches.map((match) => [match.slug, match.quote])));

	function fitBoundsForPopulation(filtered: Restaurant[], _all: Restaurant[]) {
		return coordsForFitBounds(filtered);
	}

	// Trigger fitBounds when filters change
	$effect(() => {
		const cuisineKey = appState.activeCuisines.join(',');
		const cityKey = appState.activeCities.join(',');
		const subredditKey = appState.activeSubreddits.join(',');
		const savedKey = appState.showSavedOnly;
		const radiusKey = appState.radiusMiles === null ? '' : `${appState.radiusMiles}|${appState.userLocation?.lat}|${appState.userLocation?.lng}`;
		const prevKey = `${prevCuisines}|${prevCities}|${prevSubreddits}|${prevSavedOnly}|${prevRadius}`;
		const currentKey = `${cuisineKey}|${cityKey}|${subredditKey}|${savedKey}|${radiusKey}`;

		if (currentKey !== prevKey) {
			prevCuisines = cuisineKey;
			prevCities = cityKey;
			prevSubreddits = subredditKey;
			prevSavedOnly = savedKey;
			prevRadius = radiusKey;

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
		const commentKey = commentMatches.map((match) => match.slug).join('|');
		void searchKey;
		void commentKey;
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
		viewportHeight = window.innerHeight;
		const shortPhoneQuery = window.matchMedia(SHORT_PHONE_QUERY);
		const onShortPhoneChange = () => (shortPhone = shortPhoneQuery.matches);
		onShortPhoneChange();
		shortPhoneQuery.addEventListener('change', onShortPhoneChange);
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
			viewportHeight = window.innerHeight;
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
			shortPhoneQuery.removeEventListener('change', onShortPhoneChange);
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

<svelte:window onkeydown={handleDesktopMapEscape} />

<main>
	<section class="hero-section">
		<Hero meta={data.dataset.meta} />
	</section>

	<div class="app-trap" bind:this={appTrapEl}>
		<div class="controls-bar" class:over-map={mapExpanded} bind:this={controlsBarEl} bind:clientHeight={controlsHeight}>
			<SearchBar restaurants={allRestaurants} {cuisineNames} {cityNames}
				commentMatches={visibleCommentMatches} commentQuery={appState.searchQuery.trim()}
				{commentSearchStatus} commentLimitReached={commentMatches.length >= 100} />
			<FilterBar
				restaurants={allRestaurants}
				cuisineFacetRestaurants={facetPopulations.cuisine}
				cityFacetRestaurants={facetPopulations.city}
				subredditFacetRestaurants={facetPopulations.subreddit}
				{threadSubreddit}
				restaurantsForHistogram={restaurantsBeforeFreshness}
				{dateExtent}
				unmappedCount={pageFilterResult.unmappedCount}
				resultCount={filteredRestaurants.length}
			/>
		</div>
		<div class="content-area">
			<dialog
				class="map-pane"
				class:portal-expanded={mapExpanded}
				class:desktop-expanded={mapDesktopHovered}
				class:no-map-transition={suppressMapTransition}
				class:sheet-dragging={sheetDragPx !== null}
				id="restaurant-map-panel"
				bind:this={mapPaneEl}
				style:--controls-h={mapExpanded ? `${controlsHeight}px` : undefined}
				style:--sheet-h={mapExpanded ? `${sheetHeightPx}px` : undefined}
				aria-label={mapExpanded && isMobileViewport() ? 'Restaurant map' : undefined}
				aria-hidden={isMobileViewport() && !mapExpanded ? 'true' : undefined}
				inert={isMobileViewport() && !mapExpanded ? true : undefined}
				onclose={handleMapDialogClose}
				onpointerenter={handleDesktopMapPointerEnter}
				onpointerleave={handleDesktopMapPointerLeave}
			>
				<div class="map-interactive-layer">
					<Map
						restaurants={filteredRestaurants}
						{mapExpanded}
						onBoundsChange={handleMapBoundsChange}
						insets={mapExpanded ? { top: controlsHeight, bottom: sheetHeightPx } : undefined}
						visibleBand={mapExpanded ? mapVisibleBand : undefined}
					/>
				</div>
				{#if mapExpanded}
					<button
						class="map-close-btn"
						bind:this={mapCloseButton}
						style:top="calc(env(safe-area-inset-top, 0px) + {controlsHeight + 10}px)"
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
			<!-- svelte-ignore a11y_no_static_element_interactions -- pointer shortcut; the grabber button below is the keyboard and screen-reader path -->
			<div
				class="list-pane"
				class:sheet={mapExpanded}
				class:sheet-peek={mapExpanded && sheetState === 'peek' && sheetDragPx === null}
				class:sheet-dragging={sheetDragPx !== null}
				style:height={mapExpanded ? `${sheetHeightPx}px` : undefined}
				onpointerdown={mapExpanded ? handleSheetPointerDown : undefined}
				ondragstart={(event) => event.preventDefault()}
				onclickcapture={mapExpanded ? handleSheetClickCapture : undefined}
			>
				{#if mapExpanded}
					<!-- The name says what a tap does (peek and half expand, full collapses). No
					     aria-expanded: three stops do not fit its yes/no, and at half it read
					     "Expand list, expanded". -->
					<button
						type="button"
						class="sheet-grabber"
						aria-label={sheetState === 'full' ? 'Collapse list' : 'Expand list'}
						onclick={handleSheetClick}
						onkeydown={handleSheetKeydown}
					>
						<span class="sheet-handle" aria-hidden="true"></span>
					</button>
				{/if}
				{#if mapExpanded}
					<p class="sheet-summary" aria-live="polite">{listRestaurants.length.toLocaleString('en-US')} {listRestaurants.length === 1 ? 'place' : 'places'} in this area</p>
				{/if}
				<RestaurantList
					restaurants={listRestaurants}
					emptyForMapArea={areaScoped && filteredRestaurants.length > 0}
					revealOpenRow={revealOpenRowRequest}
					windowScroll={shortPhone && !mapExpanded}
					totalCount={allRestaurants.length}
					onShowOnMap={openMobileMap}
					threadsById={threadsById}
					{commentQuotes}
				/>
			</div>
		</div>
	</div>

	{#if !mapExpanded || !isMobileViewport()}
		<BackToTop />
	{/if}

	<!-- Phones: one obvious, labeled way into the map. Lives outside .app-trap so the
	     trap's backdrop-filter cannot become its containing block. Stays mounted while the
	     modal map is open (the top layer covers it) so focus can return to it on close. -->
	<button
		type="button"
		class="map-fab mobile-map-trigger"
		class:map-fab-hidden={mapExpanded}
		aria-label={mapExpanded ? 'Close map' : 'Open map'}
		aria-controls="restaurant-map-panel"
		aria-expanded={mapExpanded}
		onclick={(event) => toggleMobileMap(event.currentTarget)}
	>
		<MapIcon size={18} aria-hidden="true" />
		<span aria-hidden="true">Map</span>
	</button>
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
		background: #fff;
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

	/* ── Desktop: hover-expand map pane (≥ 1024px) ─────────────── */
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

		/* Expanded: map grows over the list on hover */
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

		@media (prefers-reduced-motion: reduce) {
			.map-pane,
			.list-pane,
			.map-pane :global(.leaflet-right) {
				transition: none;
			}
		}
	}

	/* ── Mobile: explicit control opens the map sheet (< 1024px) ───────── */
	@media (max-width: 1023px) {
		/* A blurred shadow on a full-height sticky panel repaints expensively on phones. */
		.app-trap {
			box-shadow: none;
		}

		:global(html.mobile-map-expanded-lock),
		:global(html.mobile-map-expanded-lock body) {
			overflow: hidden;
			height: 100%;
		}

		/* The map is non-modal, so nothing else is inert: Tab out of the sheet reached the site
		   footer's links behind the map, and screen readers could read the hidden hero. */
		:global(html.mobile-map-expanded-lock .site-footer),
		:global(html.mobile-map-expanded-lock) .hero-section {
			visibility: hidden;
		}

		.map-pane {
			display: none;
		}

		.map-pane.portal-expanded {
			display: block;
			position: fixed;
			inset: 0;
			margin: 0;
			max-width: none;
			max-height: none;
			width: auto;
			height: auto;
			border-radius: 0;
			border: none;
			z-index: 1;
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

		/* Map open: the list becomes a bottom sheet over the map. Its height is set inline
		   (peek, half, full or mid-drag); the map keeps receiving touches above it. */
		.list-pane.sheet {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 3;
			background: #fff;
			border-radius: 20px 20px 0 0;
			box-shadow: 0 -4px 24px rgba(62, 44, 35, 0.22);
			overflow: hidden;
			padding-bottom: env(safe-area-inset-bottom, 0px);
			box-sizing: border-box;
			transition: height 0.25s ease;
		}

		.list-pane.sheet.sheet-dragging {
			transition: none;
		}

		.list-pane.sheet :global(.restaurant-list) {
			flex: 1;
			height: auto;
		}

		/* The sheet header already counts the places in view; a second "N of 2,725 results"
		   beside the sort buttons repeated it and announced every pan twice. The bottom
		   padding that clears the floating Map button is moot while that button is hidden. */
		.list-pane.sheet :global(.result-count) {
			display: none;
		}

		.list-pane.sheet :global(.list-scroll) {
			padding-bottom: 16px;
		}

		/* A collapsed sheet shows rows but does not scroll, so a swipe on it never fights the map.
		   Sorting waits for half height so the first result fits. */
		.list-pane.sheet-peek :global(.list-scroll) {
			overflow-y: hidden;
		}

		/* Rows drag the sheet at peek, so the browser must not claim the vertical gesture. */
		.list-pane.sheet-peek {
			touch-action: none;
		}

		.list-pane.sheet-peek :global(.sort-bar) {
			display: none;
		}

		/* Leaflet chrome stays reachable: zoom drops below the floating chips and the
		   attribution (required by OpenStreetMap) rides on top of the sheet. */
		.map-pane.portal-expanded :global(.leaflet-top) {
			top: calc(var(--controls-h, 0px) + 10px);
		}

		/* Locate sits left of Close map on the same row, with its error underneath. */
		.map-pane.portal-expanded :global(.locate-me-btn) {
			top: calc(var(--controls-h, 0px) + 10px);
		}

		.map-pane.portal-expanded :global(.location-error) {
			top: calc(var(--controls-h, 0px) + 62px);
		}

		/* The map layer is already inset by the bottom safe area, which the sheet's height
		   includes; without subtracting it the attribution floated that far above the sheet.
		   It follows the sheet's snap animation instead of jumping ahead of it. */
		.map-pane.portal-expanded :global(.leaflet-bottom) {
			bottom: calc(var(--sheet-h, 0px) - env(safe-area-inset-bottom, 0px));
			transition: bottom 0.25s ease;
		}

		.map-pane.portal-expanded.sheet-dragging :global(.leaflet-bottom) {
			transition: none;
		}

		@media (prefers-reduced-motion: reduce) {
			.list-pane.sheet,
			.map-pane.portal-expanded :global(.leaflet-bottom) {
				transition: none;
			}
		}

		.sheet-grabber {
			flex: none;
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
			height: 44px;
			padding: 0;
			border: none;
			background: transparent;
			cursor: grab;
			touch-action: none;
		}

		.sheet-summary {
			flex: none;
			touch-action: none;
			margin: -8px 0 0;
			padding: 0 20px 10px;
			font-size: 0.85rem;
			font-weight: 600;
			color: #5d4e37;
		}

		.sheet-handle {
			width: 36px;
			height: 5px;
			border-radius: 3px;
			background: #b9ad9e;
		}

		.sheet-grabber:focus-visible {
			outline: 2px solid #c43700;
			outline-offset: -4px;
			border-radius: 20px 20px 0 0;
		}

		/* Search and filter chips float over the map instead of sitting in a bar above it. */
		.controls-bar.over-map {
			position: fixed;
			top: env(safe-area-inset-top, 0px);
			left: 0;
			right: 0;
			background: linear-gradient(to bottom, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0));
		}

		.map-interactive-layer {
			position: absolute;
			inset: 0;
			padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
				env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
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

		/* The modal fills the viewport; let it escape the shell's clipping. */
		.app-trap:has(.map-pane.portal-expanded) {
			overflow: visible;
		}
		.app-trap:has(.map-pane.portal-expanded) .content-area {
			overflow: visible;
		}
	}

	.map-fab {
		display: none;
	}

	@media (max-width: 1023px) {
		.map-fab {
			position: fixed;
			left: 50%;
			bottom: max(1rem, env(safe-area-inset-bottom, 0px));
			transform: translateX(-50%);
			z-index: 1250;
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			min-height: 48px;
			padding: 0 1.25rem;
			border: none;
			border-radius: 999px;
			background: #c43700;
			color: #fffdf9;
			font-family: inherit;
			font-size: 0.95rem;
			font-weight: 600;
			box-shadow: 0 4px 16px rgba(62, 44, 35, 0.32);
			cursor: pointer;
		}

		/* display, not visibility: a visibility transition leaves the opener unfocusable for a
		   few frames after close, which broke returning focus to it. */
		.map-fab.map-fab-hidden {
			display: none;
		}

		.map-fab:active {
			background: #a82f00;
			transform: translateX(-50%) scale(0.97);
		}
	}

	/* Hide mobile-only elements on desktop */
	@media (min-width: 1024px) {
		.map-close-btn {
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
