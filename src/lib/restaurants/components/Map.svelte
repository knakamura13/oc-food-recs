<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { Restaurant } from '$lib/restaurants/types';
	import { appState } from '$lib/restaurants/stores.svelte';

	const reduceMotion = () =>
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	interface Props {
		restaurants: Restaurant[];
		mapExpanded: boolean;
	}

	let { restaurants, mapExpanded = false }: Props = $props();

	let mapContainer: HTMLDivElement | undefined = $state();
	let leafletMap: any = $state();
	let markers = new Map<string, any>();
	let showUnmapped = $state(false);
	let mapInitialized = $state(false);

	let unmappedRestaurants = $derived(restaurants.filter((r) => r.lat === null || r.lng === null));
	let mappedRestaurants = $derived(restaurants.filter((r) => r.lat !== null && r.lng !== null));

	$effect(() => {
		const target = appState.mapTarget;
		if (target && leafletMap) {
			appState.mapTarget = null;
			if (target.lat != null && target.lng != null) {
				focusOnRestaurant(target.slug, target.lat, target.lng);
			}
		}
	});

	// Bumped per selection so a stale, slow-firing moveend callback from a previous focus
	// can bail out instead of spiderfying the wrong (now off-screen) cluster.
	let focusToken = 0;

	// Center + zoom all the way in on a selected restaurant, then guarantee its individual pin
	// is visible — spiderfying its cluster when near-duplicate coordinates keep it grouped even
	// at max zoom — and highlight it. The reveal is driven here rather than relying on an
	// incidental mouse move or cluster animation, so the pin + tooltip appear on the first
	// click from the list/search whether or not the restaurant was part of a cluster.
	function focusOnRestaurant(slug: string, lat: number, lng: number) {
		if (!leafletMap) return;
		const token = ++focusToken;
		const marker = markers.get(slug);
		if (!marker || !clusterGroupRef) {
			leafletMap.setView([lat, lng], leafletMap.getMaxZoom(), { animate: !reduceMotion() });
			return;
		}

		// Reveal + highlight once the view settles. A large zoom jump fires no cluster
		// 'animationend', and a spiderfy() issued before markercluster finishes re-clustering
		// is silently dropped — so poll: re-issue spiderfy() until the marker is individually
		// visible (lone, or fanned out of its cluster), then highlight it (pin + tooltip).
		let tries = 0;
		const reveal = () => {
			if (token !== focusToken) return;
			const parent = clusterGroupRef.getVisibleParent(marker);
			if (parent === marker || clusterGroupRef._spiderfied) {
				applyHighlight();
				return;
			}
			if (parent && typeof parent.spiderfy === 'function') parent.spiderfy();
			if (++tries < 15) setTimeout(reveal, 80);
			else applyHighlight();
		};
		// Register before setView: a large zoom jump fires 'moveend' synchronously inside
		// setView, so a listener attached afterward would miss it.
		leafletMap.once('moveend', () => setTimeout(reveal, 0));
		leafletMap.setView([lat, lng], leafletMap.getMaxZoom(), { animate: !reduceMotion() });
	}

	// Highlight the hovered (preferred) or selected restaurant's pin. This is the
	// single source of truth shared with the list via appState — both list-hover
	// and pin-hover write the same slug, and this one effect drives the visual.
	$effect(() => {
		// Read both so the effect re-runs whenever either changes.
		void appState.hoveredRestaurantSlug;
		void appState.selectedRestaurantSlug;
		applyHighlight();
	});

	let clusterGroupRef: any = null;
	let L: any = null;
	let dotIcon: any = null;

	// Hover/highlight bookkeeping — imperative handles, intentionally NOT $state
	// (mutating them must not re-trigger the highlight effect).
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	let clusterHoverTimer: ReturnType<typeof setTimeout> | null = null;
	let appliedSlug: string | null = null;

	let locating = $state(false);
	let locationError = $state<string | null>(null);
	let locationMarker: any = null;
	let locationErrorTimer: ReturnType<typeof setTimeout> | null = null;

	async function initMap() {
		if (mapInitialized || !mapContainer) return;
		mapInitialized = true;

		const leafletModule = await import('leaflet');
		L = leafletModule.default || leafletModule;
		await import('leaflet/dist/leaflet.css');
		await import('leaflet.markercluster');
		await import('leaflet.markercluster/dist/MarkerCluster.css');
		await import('leaflet.markercluster/dist/MarkerCluster.Default.css');

		// One combined marker carrying both a resting dot and an (initially hidden)
		// red pin. The highlight toggles an `is-active` class on the element rather
		// than swapping icons, so the dot->pin CSS transition fires cleanly.
		dotIcon = L.divIcon({
			className: 'rec-marker',
			html:
				'<span class="rec-dot"></span>' +
				'<svg class="rec-pin" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
				'<path d="M15 1C7.8 1 2 6.8 2 14c0 9.4 13 26 13 26s13-16.6 13-26C28 6.8 22.2 1 15 1z" fill="#ff4500" stroke="#fffcf8" stroke-width="2"/>' +
				'<circle cx="15" cy="14" r="5" fill="#fffcf8"/></svg>',
			iconSize: [30, 42],
			iconAnchor: [15, 40],
			tooltipAnchor: [0, -42]
		});

		leafletMap = L.map(mapContainer).setView([33.7, -117.8], 10);

		// Disable scroll-wheel zoom on mobile to prevent scroll trapping
		if (window.innerWidth <= 1023) {
			leafletMap.scrollWheelZoom.disable();
		}

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			maxZoom: 19
		}).addTo(leafletMap);

		updateMarkers();

		setTimeout(() => leafletMap?.invalidateSize(), 100);
	}

	onMount(() => {
		if (!mapContainer) return;

		// On mobile, defer map init until visible; on desktop, init immediately
		if (window.innerWidth <= 1023) {
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting) {
						initMap();
						observer.disconnect();
					}
				},
				{ rootMargin: '100px' }
			);
			observer.observe(mapContainer);
			return () => observer.disconnect();
		} else {
			initMap();
		}
	});

	function updateMarkers() {
		if (!leafletMap || !L || !dotIcon) return;

		// Markers are about to be recreated: cancel pending hover work and drop
		// stale highlight bookkeeping so the highlight re-applies to the new set.
		if (hoverTimer) {
			clearTimeout(hoverTimer);
			hoverTimer = null;
		}
		if (clusterHoverTimer) {
			clearTimeout(clusterHoverTimer);
			clusterHoverTimer = null;
		}
		appliedSlug = null;

		// Remove old cluster group
		if (clusterGroupRef) {
			leafletMap.removeLayer(clusterGroupRef);
		}
		markers.clear();

		clusterGroupRef = L.markerClusterGroup({
			maxClusterRadius: 40,
			spiderfyOnMaxZoom: true,
			showCoverageOnHover: false
		});

		// Cluster hover popover: after a short delay, list the restaurants inside
		// the hovered cluster (sorted by score, capped) in a tooltip above it.
		clusterGroupRef.on('clustermouseover', (e: any) => {
			if (clusterHoverTimer) clearTimeout(clusterHoverTimer);
			const cluster = e.layer;
			clusterHoverTimer = setTimeout(() => {
				const childRestaurants = (cluster.getAllChildMarkers() as any[])
					.map((m) => m.restaurant as Restaurant)
					.filter(Boolean)
					.sort((a, b) => b.aggregate_score - a.aggregate_score);
				cluster
					.bindTooltip(clusterTooltipHtml(childRestaurants), {
						permanent: true,
						direction: 'top',
						className: 'rec-tooltip rec-tooltip--cluster',
						opacity: 1
					})
					.openTooltip();
				clusterHoverTimer = null;
			}, 150);
		});
		clusterGroupRef.on('clustermouseout', (e: any) => {
			if (clusterHoverTimer) {
				clearTimeout(clusterHoverTimer);
				clusterHoverTimer = null;
			}
			e.layer.unbindTooltip();
		});

		// When clusters expand/collapse, re-apply the highlight so a pin that
		// un-clusters into view picks up an active hover/selection.
		clusterGroupRef.on('animationend', () => applyHighlight());

		for (const r of mappedRestaurants) {
			const marker = L.marker([r.lat, r.lng], {
				icon: dotIcon,
				keyboard: true,
				title: r.name,
				riseOnHover: true
			});

			marker.on('click', () => {
				appState.selectedRestaurantSlug = r.slug;
				appState.listScrollTarget = r.slug;
			});

			// Debounced hover so a fast mouse sweep across pins doesn't flicker.
			marker.on('mouseover', () => {
				if (hoverTimer) clearTimeout(hoverTimer);
				hoverTimer = setTimeout(() => {
					appState.hoveredRestaurantSlug = r.slug;
					hoverTimer = null;
				}, 150);
			});
			marker.on('mouseout', () => {
				if (hoverTimer) {
					clearTimeout(hoverTimer);
					hoverTimer = null;
				}
				if (appState.hoveredRestaurantSlug === r.slug) {
					appState.hoveredRestaurantSlug = null;
				}
			});

			// Keyboard focus drives the same highlight (no-op if unsupported).
			marker.on('focus', () => {
				appState.hoveredRestaurantSlug = r.slug;
			});
			marker.on('blur', () => {
				if (appState.hoveredRestaurantSlug === r.slug) {
					appState.hoveredRestaurantSlug = null;
				}
			});

			(marker as any).restaurant = r;
			markers.set(r.slug, marker);
			clusterGroupRef.addLayer(marker);
		}

		leafletMap.addLayer(clusterGroupRef);

		// Reassert any active highlight against the freshly built markers.
		applyHighlight();
	}

	// Re-render markers when filtered restaurants change
	$effect(() => {
		// Track only the restaurant data so a real filter change rebuilds the markers.
		void mappedRestaurants;
		// updateMarkers() ends by calling applyHighlight(), which reads the hovered/selected
		// slug. Without untrack, those reads would make this rebuild effect re-run on every
		// hover/selection — tearing down and recreating all markers (and collapsing any open
		// spiderfy). untrack keeps the rebuild bound to data changes only.
		if (leafletMap && L) {
			untrack(() => updateMarkers());
		}
	});

	// Fit map bounds when fitBoundsTarget is set
	$effect(() => {
		const targets = appState.fitBoundsTarget;
		if (targets && leafletMap && L) {
			const mapped = targets.filter((r) => r.lat !== null && r.lng !== null);
			if (mapped.length > 0) {
				const bounds = L.latLngBounds(mapped.map((r) => [r.lat, r.lng]));
				leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14, animate: !reduceMotion() });
			}
			appState.fitBoundsTarget = null;
		}
	});

	// Invalidate map size when container dimensions change (desktop hover or mobile expansion)
	$effect(() => {
		if (!mapContainer || !leafletMap) return;

		const ro = new ResizeObserver(() => {
			leafletMap.invalidateSize({ animate: !reduceMotion() });
		});

		ro.observe(mapContainer);
		return () => ro.disconnect();
	});

	// Teardown: clear pending timers and dispose the Leaflet map (which drops all
	// markers, tooltips, and their DOM listeners) when the component unmounts.
	$effect(() => {
		return () => {
			if (hoverTimer) clearTimeout(hoverTimer);
			if (clusterHoverTimer) clearTimeout(clusterHoverTimer);
			if (locationErrorTimer) clearTimeout(locationErrorTimer);
			if (locationMarker && leafletMap) leafletMap.removeLayer(locationMarker);
			leafletMap?.remove();
		};
	});

	function jumpToCurrentLocation() {
		if (!leafletMap || !L || locating) return;
		if (!navigator.geolocation) {
			locationError = 'Geolocation is not supported by your browser';
			return;
		}
		locating = true;
		locationError = null;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				locating = false;
				const { latitude, longitude } = position.coords;
				if (locationMarker) {
					leafletMap.removeLayer(locationMarker);
					locationMarker = null;
				}
				locationMarker = L.circleMarker([latitude, longitude], {
					radius: 8,
					fillColor: '#4285f4',
					fillOpacity: 1,
					color: '#fff',
					weight: 2.5
				}).addTo(leafletMap);
				leafletMap.setView([latitude, longitude], 14, { animate: true });
			},
			(error) => {
				locating = false;
				locationError =
					error.code === error.PERMISSION_DENIED
						? 'Location access denied'
						: 'Unable to get your location';
				if (locationErrorTimer) clearTimeout(locationErrorTimer);
				locationErrorTimer = setTimeout(() => {
					locationError = null;
					locationErrorTimer = null;
				}, 3500);
			},
			{ timeout: 10000, maximumAge: 60000 }
		);
	}

	function scrollToRestaurant(r: Restaurant) {
		appState.selectedRestaurantSlug = r.slug;
		appState.listScrollTarget = r.slug;
	}

	function escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function tooltipHtml(r: Restaurant): string {
		return `<div class="rec-tip-inner"><strong>${escapeHtml(r.name)}</strong>${
			r.cuisine ? `<span class="rec-tip-cuisine">${escapeHtml(r.cuisine)}</span>` : ''
		}<span class="rec-tip-score">${r.aggregate_score} points</span></div>`;
	}

	function clusterTooltipHtml(restaurants: Restaurant[]): string {
		const CAP = 8;
		const shown = restaurants.slice(0, CAP);
		const extra = restaurants.length - shown.length;
		const items = shown
			.map(
				(r) =>
					`<li><span class="rec-clist-name">${escapeHtml(r.name)}</span><span class="rec-clist-score">${r.aggregate_score}</span></li>`
			)
			.join('');
		return `<div class="rec-clist"><ul>${items}</ul>${
			extra > 0 ? `<div class="rec-clist-more">+${extra} more</div>` : ''
		}</div>`;
	}

	// Reconcile the on-map highlight with the current hovered/selected slug.
	// Idempotent and safe to call from the effect, from updateMarkers, and from
	// cluster 'animationend' (so a pin that un-clusters into view lights up).
	function applyHighlight() {
		if (!clusterGroupRef) return;
		const active = appState.hoveredRestaurantSlug ?? appState.selectedRestaurantSlug;

		// Revert the previously highlighted marker if it is no longer active.
		if (appliedSlug && appliedSlug !== active) {
			const prev = markers.get(appliedSlug);
			if (prev) {
				prev.setZIndexOffset(0);
				prev.unbindTooltip();
				prev.getElement()?.classList.remove('is-active');
			}
			appliedSlug = null;
		}

		if (!active || appliedSlug === active) return;

		const next = markers.get(active);
		if (!next) return;
		// Only highlight a marker that is individually on the map. If it is inside a
		// collapsed cluster, no-op now; 'animationend' retries when the cluster opens.
		if (clusterGroupRef.getVisibleParent(next) !== next) return;

		const r = (next as any).restaurant as Restaurant;
		next.setZIndexOffset(1000);
		next.getElement()?.classList.add('is-active');
		next
			.bindTooltip(tooltipHtml(r), {
				permanent: true,
				direction: 'top',
				className: 'rec-tooltip',
				opacity: 1
			})
			.openTooltip();
		appliedSlug = active;
	}
</script>

<div class="map-panel" class:map-leaflet-chrome-hidden-mobile={!mapExpanded}>
	<div class="map-container" bind:this={mapContainer} role="application" aria-label="Map of restaurants in Orange County"></div>
	{#if !mapExpanded}
		<div class="map-click-blocker" aria-hidden="true"></div>
	{/if}

	{#if mapInitialized}
		<button
			class="locate-me-btn"
			class:is-locating={locating}
			onclick={jumpToCurrentLocation}
			title={locating ? 'Getting your location…' : 'Jump to my location'}
			aria-label="Jump to my current location"
			disabled={locating}
		>
			{#if locating}
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" class="spinner">
					<path d="M12 2a10 10 0 1 0 10 10"/>
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="3"/>
					<path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
				</svg>
			{/if}
		</button>
		{#if locationError}
			<div class="location-error" role="alert">{locationError}</div>
		{/if}
	{/if}

	{#if unmappedRestaurants.length > 0}
		<button class="unmapped-toggle" onclick={() => (showUnmapped = !showUnmapped)} aria-expanded={showUnmapped}>
			{showUnmapped ? 'Hide' : 'Show'} {unmappedRestaurants.length} unmapped restaurants
			<span class="arrow" aria-hidden="true" class:open={showUnmapped}>&rsaquo;</span>
		</button>

		{#if showUnmapped}
			<div class="unmapped-list">
				{#each unmappedRestaurants as r}
					<button class="unmapped-item" onclick={() => scrollToRestaurant(r)}>
						<span class="unmapped-name">{r.name}</span>
						<span class="unmapped-score">{r.aggregate_score} pts</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.map-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}

	.map-container {
		flex: 1 1 auto;
		min-height: 0;
		border-radius: 8px;
		overflow: hidden;
	}

	/* Transparent overlay that sits above Leaflet panes to intercept
	   the expand tap before Leaflet's own click handlers fire */
	.map-click-blocker {
		position: absolute;
		inset: 0;
		z-index: 500; /* above Leaflet panes (~400) */
		cursor: pointer;
	}

	@media (min-width: 1024px) {
		.map-click-blocker {
			display: none;
		}
	}

	.unmapped-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		flex-shrink: 0;
		padding: 0.5rem 0.75rem;
		border: none;
		background: #f0ebe3;
		font-size: 0.82rem;
		color: #5d4e37;
		cursor: pointer;
		border-top: 1px solid #e8e0d6;
		margin-top: 4px;
		border-radius: 0 0 8px 8px;
	}

	.unmapped-toggle:hover {
		background: #e8e0d6;
	}

	.arrow {
		transition: transform 0.2s;
		font-size: 1.1rem;
	}

	.arrow.open {
		transform: rotate(90deg);
	}

	.unmapped-list {
		flex-shrink: 0;
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid #e8e0d6;
		border-top: 0;
		border-radius: 0 0 8px 8px;
		background: #faf7f2;
	}

	.unmapped-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.4rem 0.75rem;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.82rem;
		text-align: left;
	}

	.unmapped-item:hover {
		background: #fff0eb;
	}

	.unmapped-name {
		color: #3e2c23;
	}

	.unmapped-score {
		color: #ff4500;
		font-weight: 600;
		font-size: 0.78rem;
	}

	@media (max-width: 1023px) {
		/* Minimized mobile FAB: hide Leaflet zoom + attribution; expanded removes this class */
		.map-panel.map-leaflet-chrome-hidden-mobile :global(.leaflet-control-container),
		.map-panel.map-leaflet-chrome-hidden-mobile :global(.leaflet-control-attribution) {
			display: none !important;
		}

		.map-panel {
			min-height: 0;
			overflow: visible;
			width: 100%;
			height: 100%;
		}

		.map-container {
			width: 100%;
			min-height: 0;
			height: 100%;
			flex: 1;
		}

		.unmapped-toggle {
			display: none;
		}

		.unmapped-list {
			display: none;
		}
	}

	@media (min-width: 1024px) {
		.unmapped-list {
			max-height: min(240px, 35%);
		}
	}

	/* === Custom markers + hover tooltips ===
	   Leaflet renders these into its own panes, outside this component's DOM,
	   so every selector must be :global to escape Svelte's scoping. */
	:global(.rec-marker) {
		background: transparent;
		border: none;
	}

	/* Resting state: small dot centered on the geo point */
	:global(.rec-dot) {
		position: absolute;
		left: 8px;
		top: 33px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ff4500;
		border: 2px solid #fffcf8;
		box-shadow: 0 1px 3px rgba(62, 44, 35, 0.4);
		box-sizing: border-box;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}

	/* Active state: larger red pin whose tip sits on the geo point */
	:global(.rec-pin) {
		position: absolute;
		left: 0;
		top: 0;
		width: 30px;
		height: 42px;
		opacity: 0;
		transform: scale(0.4);
		transform-origin: 15px 40px;
		transition: opacity 0.15s ease, transform 0.15s ease;
		filter: drop-shadow(0 2px 4px rgba(62, 44, 35, 0.4));
		pointer-events: none;
	}

	:global(.rec-marker.is-active .rec-dot) {
		opacity: 0;
		transform: scale(0.3);
	}

	:global(.rec-marker.is-active .rec-pin) {
		opacity: 1;
		transform: scale(1);
	}

	/* Tooltip box above the pin / cluster (matches the app's cream palette) */
	:global(.rec-tooltip.leaflet-tooltip) {
		background: #fffcf8;
		border: 1px solid #e0d6cc;
		border-radius: 8px;
		box-shadow: 0 2px 10px rgba(62, 44, 35, 0.18);
		color: #3e2c23;
		font-family: 'DM Sans', sans-serif;
		font-size: 0.8rem;
		padding: 6px 10px;
		white-space: nowrap;
	}

	:global(.rec-tooltip.leaflet-tooltip-top::before) {
		border-top-color: #fffcf8;
	}
	:global(.rec-tooltip.leaflet-tooltip-bottom::before) {
		border-bottom-color: #fffcf8;
	}
	:global(.rec-tooltip.leaflet-tooltip-left::before) {
		border-left-color: #fffcf8;
	}
	:global(.rec-tooltip.leaflet-tooltip-right::before) {
		border-right-color: #fffcf8;
	}

	:global(.rec-tip-inner strong) {
		display: block;
		font-weight: 600;
		color: #3e2c23;
	}
	:global(.rec-tip-cuisine) {
		display: block;
		color: #8a7866;
		font-size: 0.78rem;
	}
	:global(.rec-tip-score) {
		display: block;
		color: #ff4500;
		font-weight: 600;
		font-size: 0.78rem;
		margin-top: 2px;
	}

	/* Cluster popover list */
	:global(.rec-tooltip--cluster) {
		white-space: normal;
	}
	:global(.rec-clist) {
		min-width: 150px;
	}
	:global(.rec-clist ul) {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	:global(.rec-clist li) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 14px;
		padding: 2px 0;
		font-size: 0.78rem;
	}
	:global(.rec-clist-name) {
		color: #3e2c23;
	}
	:global(.rec-clist-score) {
		color: #ff4500;
		font-weight: 600;
	}
	:global(.rec-clist-more) {
		margin-top: 4px;
		padding-top: 4px;
		border-top: 1px solid #e0d6cc;
		color: #8a7866;
		font-size: 0.72rem;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.rec-dot),
		:global(.rec-pin) {
			transition: none !important;
		}
	}

	.locate-me-btn {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 600;
		width: 34px;
		height: 34px;
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

	.locate-me-btn:hover:not(:disabled) {
		background: #fff0eb;
		color: #ff4500;
		border-color: rgba(0, 0, 0, 0.3);
	}

	.locate-me-btn:disabled {
		cursor: default;
		opacity: 0.75;
	}

	.spinner {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.location-error {
		position: absolute;
		top: 52px;
		right: 10px;
		z-index: 600;
		background: #3e2c23;
		color: #fffcf8;
		font-size: 0.75rem;
		padding: 5px 10px;
		border-radius: 6px;
		white-space: nowrap;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
