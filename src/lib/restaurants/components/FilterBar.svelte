<script lang="ts">
	import { Bookmark, Map as MapIcon, Share2 } from 'lucide-svelte';
	import type { Restaurant } from '$lib/restaurants/types';
	import {
		appState,
		clearExplorerFilters,
		normalizeCuisine,
		normalizeCity,
		formatMonthYear,
		setFreshnessFilter
	} from '$lib/restaurants/stores.svelte';
	import { savedState } from '$lib/restaurants/saved-restaurants.svelte';
	import { getPriorVisitMs } from '$lib/restaurants/visit-tracker';
	import { onMount } from 'svelte';
	import { toast } from '$lib/toast';
	import RecencyHistogram from './RecencyHistogram.svelte';

	interface Props {
		restaurants: Restaurant[];
		/** thread_id -> subreddit, used to attribute each restaurant to its origin subreddit. */
		threadSubreddit: Record<string, string>;
		/** Restaurants after every filter EXCEPT recency — the histogram's reactive population. */
		restaurantsForHistogram: Restaurant[];
		/** Full-dataset comment-date range (epoch ms) — the fixed slider/axis extent. */
		dateExtent: { min: number; max: number };
		/** Unmapped restaurants that match the current filters/search (whether or not they are included). */
		unmappedCount?: number;
		mapExpanded?: boolean;
		onMapToggle?: (opener: HTMLButtonElement) => void;
	}

	let {
		restaurants,
		threadSubreddit,
		restaurantsForHistogram,
		dateExtent,
		unmappedCount = 0,
		mapExpanded = false,
		onMapToggle
	}: Props = $props();

	let showCuisineDropdown = $state(false);
	let showCityDropdown = $state(false);
	let showSubredditDropdown = $state(false);
	let showRecencyDropdown = $state(false);
	let lastVisitMs = $state<number | null>(null);
	let hasPriorVisit = $state(false);

	function refreshLastVisit() {
		lastVisitMs = getPriorVisitMs();
		hasPriorVisit = lastVisitMs !== null;
	}

	onMount(() => {
		refreshLastVisit();
	});

	const isNewSinceVisit = $derived(
		lastVisitMs !== null &&
			appState.freshnessSource === 'visit' &&
			appState.freshnessCutoff === lastVisitMs
	);
	const isCustomRecency = $derived(appState.freshnessCutoff !== null && !isNewSinceVisit);

	function toggleNewSinceVisit() {
		if (lastVisitMs === null) return;
		if (isNewSinceVisit) setFreshnessFilter(null);
		else setFreshnessFilter(lastVisitMs, 'visit');
	}

	function closeAllDropdowns() {
		showCuisineDropdown = false;
		showCityDropdown = false;
		showSubredditDropdown = false;
		showRecencyDropdown = false;
	}

	function handleDropdownFocusOut(event: FocusEvent) {
		const wrapper = event.currentTarget as HTMLElement;
		const next = event.relatedTarget as Node | null;
		if (next && wrapper.contains(next)) return;
		if (!next) {
			requestAnimationFrame(() => {
				if (wrapper.contains(document.activeElement)) return;
				closeAllDropdowns();
			});
			return;
		}
		closeAllDropdowns();
	}

	function toggleDropdown(which: 'cuisine' | 'city' | 'subreddit' | 'recency') {
		const next = {
			cuisine: which === 'cuisine' ? !showCuisineDropdown : false,
			city: which === 'city' ? !showCityDropdown : false,
			subreddit: which === 'subreddit' ? !showSubredditDropdown : false,
			recency: which === 'recency' ? !showRecencyDropdown : false
		};
		showCuisineDropdown = next.cuisine;
		showCityDropdown = next.city;
		showSubredditDropdown = next.subreddit;
		showRecencyDropdown = next.recency;
	}

	// Flattened dated mentions for the density histogram; reacts to the other active filters.
	let histogramMentions = $derived(restaurantsForHistogram.flatMap((r) => r.mentions));
	// Non-empty only when the recency filter is engaged; doubles as the pill label.
	let recencyLabel = $derived.by(() => {
		if (appState.freshnessCutoff === null) return '';
		if (isNewSinceVisit) return 'New since last visit';
		return `Since ${formatMonthYear(appState.freshnessCutoff)}`;
	});

	let subredditCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const r of restaurants) {
			const seen = new Set<string>();
			for (const tid of r.source_threads) {
				const sub = threadSubreddit[tid];
				if (sub) seen.add(sub);
			}
			for (const sub of seen) counts.set(sub, (counts.get(sub) || 0) + 1);
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([name, count]) => ({ name, count }));
	});

	// Only worth showing the subreddit filter once data spans more than one subreddit.
	let showSubredditFilter = $derived(subredditCounts.length > 1);

	let cuisineCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const r of restaurants) {
			const c = normalizeCuisine(r.cuisine);
			if (c === 'Unknown' || c === 'Other') continue;
			counts.set(c, (counts.get(c) || 0) + 1);
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([name, count]) => ({ name, count }));
	});

	let cityCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const r of restaurants) {
			const city = normalizeCity(r.location);
			if (!city || city === 'Other') continue;
			counts.set(city, (counts.get(city) || 0) + 1);
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([name, count]) => ({ name, count }));
	});

	function toggleCuisine(cuisine: string) {
		const idx = appState.activeCuisines.indexOf(cuisine);
		if (idx >= 0) {
			appState.activeCuisines = appState.activeCuisines.filter((c) => c !== cuisine);
		} else {
			appState.activeCuisines = [...appState.activeCuisines, cuisine];
		}
	}

	function toggleCity(city: string) {
		const idx = appState.activeCities.indexOf(city);
		if (idx >= 0) {
			appState.activeCities = appState.activeCities.filter((c) => c !== city);
		} else {
			appState.activeCities = [...appState.activeCities, city];
		}
	}

	function toggleSubreddit(subreddit: string) {
		const idx = appState.activeSubreddits.indexOf(subreddit);
		if (idx >= 0) {
			appState.activeSubreddits = appState.activeSubreddits.filter((s) => s !== subreddit);
		} else {
			appState.activeSubreddits = [...appState.activeSubreddits, subreddit];
		}
	}

	function clearAllFilters() {
		clearExplorerFilters({ includeSearch: true });
	}

	function copyShareUrl() {
		if (typeof window === 'undefined' || !navigator.clipboard?.writeText) {
			toast.error('Could not copy share link');
			return;
		}
		navigator.clipboard.writeText(window.location.href).then(
			() => toast.success('Share link copied to clipboard!'),
			() => toast.error('Could not copy share link')
		);
	}

	let savedCount = $derived(savedState.slugs.length);
	let searchPillLabel = $derived(appState.searchQuery.trim());

	let hasActiveFilters = $derived(
		searchPillLabel.length > 0 ||
			appState.activeCuisines.length > 0 ||
			appState.activeCities.length > 0 ||
			appState.activeSubreddits.length > 0 ||
			appState.freshnessCutoff !== null ||
			appState.showUnmapped ||
			appState.showSavedOnly
	);

	function clearSearchFilter() {
		appState.searchQuery = '';
	}
</script>

<nav class="filter-bar" aria-label="Restaurant filters">
	<div class="filter-controls">
		<!-- Cuisine dropdown -->
		<div class="dropdown-wrapper" onfocusout={handleDropdownFocusOut}>
			<button
				class="dropdown-trigger"
				class:has-active={appState.activeCuisines.length > 0}
				aria-expanded={showCuisineDropdown}
				aria-haspopup="listbox"
				aria-controls={showCuisineDropdown ? 'cuisine-listbox' : undefined}
				onclick={() => toggleDropdown('cuisine')}
			>
				Cuisine
				{#if appState.activeCuisines.length > 0}
					<span class="badge">{appState.activeCuisines.length}</span>
				{/if}
				<span class="arrow" aria-hidden="true" class:open={showCuisineDropdown}>&#9662;</span>
			</button>

			{#if showCuisineDropdown}
				<div class="dropdown-panel" id="cuisine-listbox" role="listbox" aria-label="Filter by cuisine">
					{#each cuisineCounts as { name, count } (name)}
						<button
							class="dropdown-item"
							class:active={appState.activeCuisines.includes(name)}
							onclick={() => toggleCuisine(name)}
							role="option"
							aria-selected={appState.activeCuisines.includes(name)}
						>
							<span class="item-check" aria-hidden="true">{appState.activeCuisines.includes(name) ? '\u2713' : ''}</span>
							<span class="item-name">{name}</span>
							<span class="item-count">({count})</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- City dropdown -->
		<div class="dropdown-wrapper" onfocusout={handleDropdownFocusOut}>
			<button
				class="dropdown-trigger"
				class:has-active={appState.activeCities.length > 0}
				aria-expanded={showCityDropdown}
				aria-haspopup="listbox"
				aria-controls={showCityDropdown ? 'city-listbox' : undefined}
				onclick={() => toggleDropdown('city')}
			>
				City
				{#if appState.activeCities.length > 0}
					<span class="badge">{appState.activeCities.length}</span>
				{/if}
				<span class="arrow" aria-hidden="true" class:open={showCityDropdown}>&#9662;</span>
			</button>

			{#if showCityDropdown}
				<div class="dropdown-panel" id="city-listbox" role="listbox" aria-label="Filter by city">
					{#each cityCounts as { name, count } (name)}
						<button
							class="dropdown-item"
							class:active={appState.activeCities.includes(name)}
							onclick={() => toggleCity(name)}
							role="option"
							aria-selected={appState.activeCities.includes(name)}
						>
							<span class="item-check" aria-hidden="true">{appState.activeCities.includes(name) ? '\u2713' : ''}</span>
							<span class="item-name">{name}</span>
							<span class="item-count">({count})</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Recency dropdown — comment-density histogram + freshness cutoff -->
		<div class="dropdown-wrapper" onfocusout={handleDropdownFocusOut}>
			<button
				class="dropdown-trigger"
				class:has-active={isCustomRecency}
				aria-expanded={showRecencyDropdown}
				aria-haspopup="true"
				aria-controls={showRecencyDropdown ? 'recency-panel' : undefined}
				onclick={() => toggleDropdown('recency')}
			>
				Recency
				<span class="arrow" aria-hidden="true" class:open={showRecencyDropdown}>&#9662;</span>
			</button>

			{#if showRecencyDropdown}
				<div
					class="dropdown-panel recency-panel"
					id="recency-panel"
					role="group"
					aria-label="Filter by comment recency"
				>
					<RecencyHistogram mentions={histogramMentions} extent={dateExtent} />
				</div>
			{/if}
		</div>

		<!-- Subreddit dropdown (only when data spans more than one subreddit) -->
		{#if showSubredditFilter}
			<div class="dropdown-wrapper" onfocusout={handleDropdownFocusOut}>
				<button
					class="dropdown-trigger"
					class:has-active={appState.activeSubreddits.length > 0}
					aria-expanded={showSubredditDropdown}
					aria-haspopup="listbox"
					aria-controls={showSubredditDropdown ? 'subreddit-listbox' : undefined}
					onclick={() => toggleDropdown('subreddit')}
				>
					Subreddit
					{#if appState.activeSubreddits.length > 0}
						<span class="badge">{appState.activeSubreddits.length}</span>
					{/if}
					<span class="arrow" aria-hidden="true" class:open={showSubredditDropdown}>&#9662;</span>
				</button>

				{#if showSubredditDropdown}
					<div class="dropdown-panel" id="subreddit-listbox" role="listbox" aria-label="Filter by subreddit">
						{#each subredditCounts as { name, count } (name)}
							<button
								class="dropdown-item"
								class:active={appState.activeSubreddits.includes(name)}
								onclick={() => toggleSubreddit(name)}
								role="option"
								aria-selected={appState.activeSubreddits.includes(name)}
							>
								<span class="item-check" aria-hidden="true">{appState.activeSubreddits.includes(name) ? '✓' : ''}</span>
								<span class="item-name">r/{name}</span>
								<span class="item-count">({count})</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Saved — only once the user has bookmarked something (or the filter is on) -->
		{#if savedCount > 0 || appState.showSavedOnly}
			<button
				class="dropdown-trigger mapped-only-toggle saved-toggle"
				class:has-active={appState.showSavedOnly}
				aria-pressed={appState.showSavedOnly}
				onclick={() => (appState.showSavedOnly = !appState.showSavedOnly)}
			>
				<Bookmark size={13} aria-hidden="true" />
				Saved
				{#if savedCount > 0}
					<span class="badge">{savedCount}</span>
				{/if}
			</button>
		{/if}

		<!-- New-since — only after a prior visit is recorded -->
		{#if hasPriorVisit}
			<button
				class="dropdown-trigger mapped-only-toggle"
				class:has-active={isNewSinceVisit}
				aria-pressed={isNewSinceVisit}
				onclick={toggleNewSinceVisit}
			>
				{#if isNewSinceVisit}
					<span aria-hidden="true">✓</span>
				{/if}
				New since last visit
			</button>
		{/if}

		{#if unmappedCount > 0 || appState.showUnmapped}
			<button
				class="dropdown-trigger mapped-only-toggle"
				class:has-active={appState.showUnmapped}
				aria-pressed={appState.showUnmapped}
				aria-label={appState.showUnmapped
					? `Including ${unmappedCount} unmapped ${unmappedCount === 1 ? 'restaurant' : 'restaurants'} in the list`
					: `Include ${unmappedCount} unmapped ${unmappedCount === 1 ? 'restaurant' : 'restaurants'} in the list`}
				onclick={() => (appState.showUnmapped = !appState.showUnmapped)}
			>
				{#if appState.showUnmapped}
					<span aria-hidden="true">✓</span>
				{/if}
				Include unmapped
				{#if unmappedCount > 0}
					<span class="badge">{unmappedCount}</span>
				{/if}
			</button>
		{/if}

		{#if onMapToggle}
			<button
				type="button"
				class="dropdown-trigger mobile-map-trigger"
				class:has-active={mapExpanded}
				aria-label={mapExpanded ? 'Close map' : 'Open map'}
				aria-expanded={mapExpanded}
				aria-controls="restaurant-map-panel"
				onclick={(event) => onMapToggle?.(event.currentTarget)}
			>
				<MapIcon size={13} aria-hidden="true" />
				Map
			</button>
		{/if}

		<button
			class="dropdown-trigger share-btn"
			title="Share view"
			aria-label="Share view"
			onclick={copyShareUrl}
		>
			<Share2 size={13} aria-hidden="true" />
			Share
		</button>

		{#if hasActiveFilters}
			<button class="clear-filters" onclick={clearAllFilters}>Clear all</button>
		{/if}
	</div>

	<!-- Active filter pills — one dismissible chip per active constraint -->
	{#if hasActiveFilters}
		<div class="active-pills" aria-label="Active filters">
			{#if searchPillLabel}
				<button
					class="pill search-pill"
					onclick={clearSearchFilter}
					aria-label="Remove search filter for {searchPillLabel}"
				>
					&ldquo;{searchPillLabel}&rdquo; &times;
				</button>
			{/if}
			{#each appState.activeCuisines as cuisine (cuisine)}
				<button class="pill cuisine-pill" onclick={() => toggleCuisine(cuisine)} aria-label="Remove {cuisine} filter">
					{cuisine} &times;
				</button>
			{/each}
			{#each appState.activeCities as city (city)}
				<button class="pill city-pill" onclick={() => toggleCity(city)} aria-label="Remove {city} filter">
					{city} &times;
				</button>
			{/each}
			{#each appState.activeSubreddits as subreddit (subreddit)}
				<button class="pill subreddit-pill" onclick={() => toggleSubreddit(subreddit)} aria-label="Remove r/{subreddit} filter">
					r/{subreddit} &times;
				</button>
			{/each}
			{#if recencyLabel}
				<button
					class="pill recency-pill"
					onclick={() => setFreshnessFilter(null)}
					aria-label={isNewSinceVisit
						? 'Remove new since last visit filter'
						: 'Remove recency filter'}
				>
					{recencyLabel} &times;
				</button>
			{/if}
			{#if appState.showSavedOnly}
				<button
					class="pill saved-pill"
					onclick={() => (appState.showSavedOnly = false)}
					aria-label="Remove saved filter"
				>
					Saved &times;
				</button>
			{/if}
			{#if appState.showUnmapped}
				<button
					class="pill unmapped-pill"
					onclick={() => (appState.showUnmapped = false)}
					aria-label="Stop including unmapped restaurants"
				>
					Unmapped &times;
				</button>
			{/if}
		</div>
	{/if}
</nav>

<!-- Click-away & keyboard listeners -->
<svelte:window
	onclick={(e) => {
		const target = e.target as HTMLElement;
		if (!target.closest('.dropdown-wrapper')) {
			closeAllDropdowns();
		}
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			const openTrigger = document.querySelector<HTMLElement>(
				'.dropdown-trigger[aria-expanded="true"]'
			);
			closeAllDropdowns();
			openTrigger?.focus();
			return;
		}
		const open =
			showCuisineDropdown || showCityDropdown || showSubredditDropdown || showRecencyDropdown;
		if (!open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
		const panel = document.querySelector('.dropdown-panel');
		if (!panel) return;
		const items = [...panel.querySelectorAll<HTMLButtonElement>('.dropdown-item')];
		if (items.length === 0) return;
		e.preventDefault();
		const idx = items.indexOf(document.activeElement as HTMLButtonElement);
		const next =
			e.key === 'ArrowDown'
				? items[(idx + 1 + items.length) % items.length]
				: items[(idx - 1 + items.length) % items.length];
		next?.focus();
	}}
/>

<style>
	.filter-bar {
		padding: 0.5rem 1rem;
		border-bottom: 1px solid rgba(232, 224, 214, 0.5);
		background: transparent;
	}

	.filter-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.dropdown-wrapper {
		position: relative;
	}

	.dropdown-trigger {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border: 1px solid #d4c8bb;
		border-radius: 6px;
		background: #fffcf8;
		font-family: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		color: #5d4e37;
		font-weight: 500;
		transition: all 0.15s;
	}

	.dropdown-trigger:hover {
		border-color: #ff4500;
		color: #c43700;
	}

	.dropdown-trigger.has-active {
		background: #fff0eb;
		border-color: #ff4500;
		color: #c43700;
	}

	.badge {
		background: #c43700;
		color: #fff;
		font-size: 0.7rem;
		padding: 1px 5px;
		border-radius: 10px;
		font-weight: 600;
	}

	.arrow {
		font-size: 0.7rem;
		transition: transform 0.2s;
	}

	.arrow.open {
		transform: rotate(180deg);
	}

	.dropdown-panel {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: min(220px, calc(100vw - 2rem));
		max-height: 320px;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: rgba(255, 252, 248, 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid #e0d6cc;
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(62, 44, 35, 0.12);
		z-index: 1100;
		padding: 4px 0;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 6px 10px;
		border: none;
		background: none;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.84rem;
		text-align: left;
		gap: 6px;
		color: #3e2c23;
	}

	.dropdown-item:hover {
		background: #faf7f2;
	}

	.dropdown-item.active {
		background: #fff0eb;
		color: #c43700;
	}

	.item-check {
		width: 16px;
		font-size: 0.75rem;
		color: #c43700;
		flex-shrink: 0;
	}

	.item-name {
		flex: 1;
	}

	.item-count {
		font-size: 0.75rem;
		color: #7a6e63;
	}

	.clear-filters {
		font-family: inherit;
		font-size: 0.8rem;
		padding: 4px 10px;
		border: none;
		background: none;
		color: #c43700;
		cursor: pointer;
		font-weight: 500;
	}

	.clear-filters:hover {
		text-decoration: underline;
	}

	.active-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 5px 10px;
		border-radius: 12px;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		border: none;
		font-weight: 500;
		transition: opacity 0.15s ease, transform 0.1s ease;
	}

	.cuisine-pill {
		background: #f0ebe3;
		color: #5d4e37;
	}

	.city-pill {
		background: #fce8e0;
		color: #b5543a;
	}

	.subreddit-pill {
		background: #e6eef5;
		color: #3a5a7a;
	}

	.recency-pill {
		background: #fff0eb;
		color: #c43700;
	}

	.saved-pill {
		background: #f3ecdd;
		color: #8a6d1f;
	}

	.search-pill {
		background: #ebe6df;
		color: #3e2c23;
		max-width: 16rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.unmapped-pill {
		background: #e8ece8;
		color: #3d5a45;
	}

	.saved-toggle:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.mobile-map-trigger {
		display: none;
	}

	.recency-panel {
		min-width: 300px;
	}

	.pill:hover {
		opacity: 0.85;
		transform: translateY(-1px);
		box-shadow: 0 2px 6px rgba(62, 44, 35, 0.1);
	}

	.pill:active {
		transform: scale(0.95) translateY(0);
		box-shadow: none;
	}

	@media (max-width: 1023px) {
		.mobile-map-trigger {
			display: inline-flex;
		}

		.dropdown-trigger {
			min-height: 44px;
			padding-top: 0;
			padding-bottom: 0;
		}
	}
</style>
