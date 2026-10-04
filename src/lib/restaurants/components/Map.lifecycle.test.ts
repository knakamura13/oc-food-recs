import { render, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import MapView from './Map.svelte';
import { appState } from '$lib/restaurants/stores.svelte';
import { makeRestaurant, resetAppState } from '$lib/restaurants/test-utils';

const harness = vi.hoisted(() => ({
	map: null as any,
	group: null as any,
	options: null as any,
	queued: [] as any[],
	visible: new Set<any>(),
	collocated: false,
	spiderfy: vi.fn()
}));

vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet', () => {
	const map = {
		setView: vi.fn(function () { return map; }),
		getMaxZoom: () => 19,
		scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
		on: vi.fn(), once: vi.fn((_event, callback) => callback()),
		addLayer: vi.fn(), removeLayer: vi.fn(), remove: vi.fn(),
		invalidateSize: vi.fn(), fitBounds: vi.fn()
	};
	return { default: {
		map: () => { harness.map = map; return map; },
		divIcon: () => ({}), tileLayer: () => ({ addTo: vi.fn() }),
		latLngBounds: (points: any) => points,
		marker: (_point: any, options: any) => {
			const marker = {
				name: options.title, on: vi.fn(), setZIndexOffset: vi.fn(),
				getElement: () => null, getTooltip: () => null,
				unbindTooltip: vi.fn(), openTooltip: vi.fn(),
				bindTooltip: vi.fn(function () { return marker; })
			};
			return marker;
		},
		markerClusterGroup: (options: any) => {
			harness.options = options;
			const cluster = { spiderfy: () => { harness.spiderfy(); harness.collocated = false; } };
			const group = {
				on: vi.fn(),
				addLayers: (markers: any[]) => { harness.queued.push(...markers); },
				// Like markercluster, removing a not-yet-inserted marker does nothing.
				removeLayer: (marker: any) => harness.visible.delete(marker),
				getVisibleParent: (marker: any) => harness.visible.has(marker)
					? (harness.collocated ? cluster : marker) : null
			};
			harness.group = group;
			return group;
		}
	} };
});

function finishBatch() {
	const queued = harness.queued.splice(0);
	queued.forEach(marker => harness.visible.add(marker));
	harness.options.chunkProgress(queued.length, queued.length);
}

beforeEach(() => {
	resetAppState();
	vi.clearAllMocks();
	harness.queued = [];
	harness.visible.clear();
	harness.collocated = false;
	vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
	vi.stubGlobal('IntersectionObserver', class {
		constructor(private callback: IntersectionObserverCallback) {}
		observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as any); }
		disconnect() {}
	});
});

it('removes a filtered-out marker even when its initial chunk has not landed', async () => {
	const first = makeRestaurant({ slug: 'first', name: 'First' });
	const second = makeRestaurant({ slug: 'second', name: 'Second' });
	const view = render(MapView, { restaurants: [first, second], mapExpanded: true });
	await waitFor(() => expect(harness.queued).toHaveLength(2));
	await view.rerender({ restaurants: [first], mapExpanded: true });
	// Let the normal filter debounce run while the batch is still pending.
	await new Promise(resolve => setTimeout(resolve, 350));
	finishBatch();
	await waitFor(() => expect([...harness.visible].map(marker => marker.name)).toEqual(['First']));
});

it('resumes a pending explicit focus and spiderfies collocated pins after completion', async () => {
	const first = makeRestaurant({ slug: 'first' });
	const target = makeRestaurant({ slug: 'target' });
	render(MapView, { restaurants: [first, target], mapExpanded: true });
	await waitFor(() => expect(harness.queued).toHaveLength(2));
	flushSync(() => {
		appState.selectedRestaurantSlug = target.slug;
		appState.mapTarget = { slug: target.slug, lat: target.lat!, lng: target.lng! };
	});
	expect(harness.spiderfy).not.toHaveBeenCalled();
	harness.collocated = true;
	finishBatch();
	await waitFor(() => expect(harness.spiderfy).toHaveBeenCalledOnce());
	expect(harness.map.setView).toHaveBeenLastCalledWith([target.lat, target.lng], 19, { animate: true });
});

it('drops pending focus when filters remove its restaurant before the batch completes', async () => {
	const first = makeRestaurant({ slug: 'first', name: 'First', lat: 33.7, lng: -117.8 });
	const target = makeRestaurant({ slug: 'target', name: 'Target', lat: 33.8, lng: -117.9 });
	const view = render(MapView, { restaurants: [first, target], mapExpanded: true });
	await waitFor(() => expect(harness.queued).toHaveLength(2));
	flushSync(() => {
		appState.selectedRestaurantSlug = target.slug;
		appState.mapTarget = { slug: target.slug, lat: target.lat!, lng: target.lng! };
	});
	await view.rerender({ restaurants: [first], mapExpanded: true });
	flushSync(() => { appState.fitBoundsTarget = [{ lat: first.lat!, lng: first.lng! }]; });
	expect(harness.map.fitBounds).toHaveBeenCalledWith([[first.lat, first.lng]],
		{ padding: [30, 30], maxZoom: 14, animate: true });
	harness.map.setView.mockClear();
	finishBatch();
	await waitFor(() => expect([...harness.visible].map(marker => marker.name)).toEqual(['First']));
	// Filtering retains selection state, but it must not restore a removed map target.
	expect(appState.selectedRestaurantSlug).toBe(target.slug);
	expect(harness.map.setView).not.toHaveBeenCalled();
});


it('lets a pending chunk finish before disposing its Leaflet map', async () => {
	const view = render(MapView, { restaurants: [makeRestaurant()], mapExpanded: true });
	await waitFor(() => expect(harness.queued).toHaveLength(1));
	view.unmount();
	expect(harness.map.remove).not.toHaveBeenCalled();
	finishBatch();
	await waitFor(() => expect(harness.map.remove).toHaveBeenCalledOnce());
});
