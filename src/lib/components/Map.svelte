<script lang="ts">
	import { onMount } from 'svelte';
	import type { Restaurant } from '$lib/types';
	import { appState, slugify } from '$lib/stores.svelte';

	interface Props {
		restaurants: Restaurant[];
		mapExpanded: boolean;
	}

	let { restaurants, mapExpanded = false }: Props = $props();

	let mapContainer: HTMLDivElement | undefined = $state();
	let leafletMap: any = $state();
	let markers = new Map<string, any>();
	let showUnmapped = $state(false);

	let unmappedRestaurants = $derived(restaurants.filter((r) => r.lat === null || r.lng === null));
	let mappedRestaurants = $derived(restaurants.filter((r) => r.lat !== null && r.lng !== null));

	$effect(() => {
		if (appState.mapTarget && leafletMap) {
			const r = appState.mapTarget;
			if (r.lat && r.lng) {
				leafletMap.setView([r.lat, r.lng], 15, { animate: true });
				const marker = markers.get(slugify(r.name));
				if (marker) {
					marker.openPopup();
				}
			}
			appState.mapTarget = null;
		}
	});

	let clusterGroupRef: any = null;
	let L: any = null;

	onMount(async () => {
		const leafletModule = await import('leaflet');
		L = leafletModule.default || leafletModule;
		await import('leaflet/dist/leaflet.css');
		await import('leaflet.markercluster');
		await import('leaflet.markercluster/dist/MarkerCluster.css');
		await import('leaflet.markercluster/dist/MarkerCluster.Default.css');

		if (!mapContainer) return;

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
	});

	function updateMarkers() {
		if (!leafletMap || !L) return;

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

		const defaultIcon = L.icon({
			iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
			iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
			shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
			iconSize: [25, 41],
			iconAnchor: [12, 41],
			popupAnchor: [1, -34],
			shadowSize: [41, 41]
		});

		for (const r of mappedRestaurants) {
			const marker = L.marker([r.lat, r.lng], { icon: defaultIcon }).bindPopup(
				`<div style="min-width:140px">
					<strong>${r.name}</strong><br/>
					${r.cuisine ? `<span style="color:#777;font-size:0.85em">${r.cuisine}</span><br/>` : ''}
					<span style="color:#ff4500;font-weight:600">${r.aggregate_score} points</span>
				</div>`
			);

			marker.on('click', () => {
				appState.selectedRestaurantSlug = slugify(r.name);
				appState.listScrollTarget = r;
			});

			markers.set(slugify(r.name), marker);
			clusterGroupRef.addLayer(marker);
		}

		leafletMap.addLayer(clusterGroupRef);
	}

	// Re-render markers when filtered restaurants change
	$effect(() => {
		// Access mappedRestaurants to track the dependency
		const _mapped = mappedRestaurants;
		if (leafletMap && L) {
			updateMarkers();
		}
	});

	// Fit map bounds when fitBoundsTarget is set
	$effect(() => {
		const targets = appState.fitBoundsTarget;
		if (targets && leafletMap && L) {
			const mapped = targets.filter((r) => r.lat !== null && r.lng !== null);
			if (mapped.length > 0) {
				const bounds = L.latLngBounds(mapped.map((r: Restaurant) => [r.lat, r.lng]));
				leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14, animate: true });
			}
			appState.fitBoundsTarget = null;
		}
	});

	// Invalidate map size when portal expands/collapses
	$effect(() => {
		const _ = mapExpanded; // reactive tracking
		if (leafletMap) {
			setTimeout(() => leafletMap.invalidateSize(true), 50);
			setTimeout(() => leafletMap.invalidateSize(true), 450); // after transition ends
		}
	});

	function scrollToRestaurant(r: Restaurant) {
		appState.selectedRestaurantSlug = slugify(r.name);
		appState.listScrollTarget = r;
	}
</script>

<div class="map-panel">
	<div class="map-container" bind:this={mapContainer}></div>
	{#if !mapExpanded}
		<div class="map-click-blocker" aria-hidden="true"></div>
	{/if}

	{#if unmappedRestaurants.length > 0}
		<button class="unmapped-toggle" onclick={() => (showUnmapped = !showUnmapped)}>
			{showUnmapped ? 'Hide' : 'Show'} {unmappedRestaurants.length} unmapped restaurants
			<span class="arrow" class:open={showUnmapped}>&rsaquo;</span>
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
		min-height: 400px;
		position: relative;
	}

	.map-container {
		flex: 1;
		min-height: 350px;
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
		padding: 0.5rem 0.75rem;
		border: none;
		background: #f5f5f5;
		font-size: 0.82rem;
		color: #666;
		cursor: pointer;
		border-top: 1px solid #eee;
		margin-top: 4px;
		border-radius: 0 0 8px 8px;
	}

	.unmapped-toggle:hover {
		background: #eee;
	}

	.arrow {
		transition: transform 0.2s;
		font-size: 1.1rem;
	}

	.arrow.open {
		transform: rotate(90deg);
	}

	.unmapped-list {
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid #eee;
		border-top: 0;
		border-radius: 0 0 8px 8px;
		background: #fafafa;
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
		background: #fff3ed;
	}

	.unmapped-name {
		color: #333;
	}

	.unmapped-score {
		color: #ff4500;
		font-weight: 600;
		font-size: 0.78rem;
	}

	@media (max-width: 1023px) {
		/* Force map to full viewport size so Leaflet initializes at a useful
		   resolution. The parent .map-pane clips it to circle/rect via overflow:hidden. */
		.map-panel {
			min-height: unset;
			width: 100vw;
			height: 70vh;
		}

		.map-container {
			min-height: unset;
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
</style>
