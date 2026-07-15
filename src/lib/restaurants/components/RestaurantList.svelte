<script lang="ts">
	import { Bookmark, ChevronRight, MapPin } from 'lucide-svelte';
	import { tick, untrack } from 'svelte';
	import {
		Virtualizer,
		elementScroll,
		observeElementOffset,
		observeElementRect,
		measureElement as measureVirtualElement,
		type VirtualItem
	} from '@tanstack/virtual-core';
	import { TableHandler } from '@vincjo/datatables';
	import type { Mention, Restaurant, SortKey } from '$lib/restaurants/types';
	import { appState, latestMentionMs, normalizeCuisine } from '$lib/restaurants/stores.svelte';
	import { buildCanonicalShareUrl } from '$lib/restaurants/page-meta';
	import { isSaved, toggleSaved } from '$lib/restaurants/saved-restaurants.svelte';
	import { getLastVisitMs, hasNewMentionsSince } from '$lib/restaurants/visit-tracker';
	import { onMount } from 'svelte';
	import { toast } from '$lib/toast';

	interface Props {
		restaurants: Restaurant[];
		onShowOnMap?: () => void;
	}

	let { restaurants, onShowOnMap }: Props = $props();

	let priorVisitMs = $state<number | null>(null);

	onMount(() => {
		priorVisitMs = getLastVisitMs();
	});

	function hasNewMentions(restaurant: Restaurant): boolean {
		if (priorVisitMs === null) return false;
		return hasNewMentionsSince(
			priorVisitMs,
			restaurant.mentions.map((m) => m.comment_date ?? null)
		);
	}

	const reduceMotion = () =>
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Full mentions are lazy-loaded per restaurant on first expand (kept out of the
	// prerendered page payload). Cached by slug; `undefined` = not yet loaded.
	let details = $state<Record<string, Mention[] | undefined>>({});
	let openScoreTipSlug = $state<string | null>(null);
	async function loadDetail(slug: string) {
		if (details[slug] !== undefined) return;
		try {
			const res = await fetch(`/api/r/${slug}.json`);
			if (!res.ok) {
				details[slug] = [];
				toast.error('Could not load mentions');
				return;
			}
			details[slug] = await res.json();
		} catch {
			details[slug] = [];
			toast.error('Could not load mentions');
		}
	}

	// Load detail whenever a restaurant becomes selected (row tap, search, map, or URL).
	$effect(() => {
		const slug = appState.selectedRestaurantSlug;
		if (slug) loadDetail(slug);
	});

	// Drawer height changes when mentions finish loading; virtualizer must catch up.
	$effect(() => {
		const slug = appState.selectedRestaurantSlug;
		if (!slug || details[slug] === undefined) return;
		scheduleRemeasure();
	});

	const table = new TableHandler<Restaurant>([], { rowsPerPage: null as unknown as number });
	const scoreSort = table.createSort('aggregate_score');
	// Restaurants with no dated mentions sort last in either direction (null comparator rule).
	const recencySort = table.createSort((r: Restaurant) => latestMentionMs(r));
	const nameSort = table.createSort('name');

	const sortOptions = [
		{ key: 'score' as const, label: 'Score', sort: scoreSort, defaultDirection: 'desc' as const },
		{ key: 'recency' as const, label: 'Recent', sort: recencySort, defaultDirection: 'desc' as const },
		{ key: 'name' as const, label: 'Name', sort: nameSort, defaultDirection: 'asc' as const }
	] as const;

	function optionFor(key: SortKey) {
		return sortOptions.find((o) => o.key === key);
	}

	function applySortFromAppState() {
		const opt = optionFor(appState.sortKey);
		if (!opt) return;
		appState.sortDirection === 'desc' ? opt.sort.desc() : opt.sort.asc();
	}

	$effect(() => {
		table.setRows(restaurants);
		const opt = optionFor(appState.sortKey);
		if (opt && !opt.sort.isActive) {
			applySortFromAppState();
		}
	});

	function cycleSort(key: Exclude<SortKey, null>) {
		const opt = optionFor(key);
		if (!opt) return;
		if (appState.sortKey !== key) {
			appState.sortKey = key;
			appState.sortDirection = opt.defaultDirection;
			applySortFromAppState();
		} else if (appState.sortDirection === opt.defaultDirection) {
			appState.sortDirection = opt.defaultDirection === 'desc' ? 'asc' : 'desc';
			applySortFromAppState();
		} else {
			appState.sortKey = null;
			appState.sortDirection = 'desc'; // direction is meaningless unsorted; avoids a stray ?sortdir= in the URL
			table.clearSort();
			table.setRows(restaurants);
		}
	}

	let listScrollEl = $state<HTMLDivElement | undefined>();
	let virtualizer = $state<Virtualizer<HTMLDivElement, HTMLDivElement> | null>(null);
	let virtualItems = $state<VirtualItem[]>([]);
	let totalSize = $state(0);

	function syncVirtualState(instance: Virtualizer<HTMLDivElement, HTMLDivElement>) {
		virtualItems = instance.getVirtualItems();
		totalSize = instance.getTotalSize();
	}

	// Create the virtualizer exactly once per scroll element. `table.rows` is read
	// untracked here: if this effect depended on it, every sort/filter change would
	// destroy and recreate the virtualizer, wiping its measured-size cache — mounted
	// rows never re-measure (their action only re-fires on index change), so rows
	// would silently fall back to the 72px estimate and overlap (worst on narrow
	// viewports, where wrapped rows are 2-3x taller than the estimate).
	$effect(() => {
		if (!listScrollEl) return;

		const cleanup = untrack(() => {
			const instance = new Virtualizer<HTMLDivElement, HTMLDivElement>({
				count: table.rows.length,
				getScrollElement: () => listScrollEl ?? null,
				estimateSize: () => 72,
				overscan: 8,
				scrollToFn: elementScroll,
				observeElementRect,
				observeElementOffset,
				measureElement: measureVirtualElement,
				getItemKey: (index) => table.rows[index]?.slug ?? index,
				onChange: (inst) => {
					syncVirtualState(inst);
				}
			});

			virtualizer = instance;
			// virtual-core requires the mount lifecycle to attach its rect/scroll
			// observers; without these calls getVirtualItems() is always empty.
			const unmount = instance._didMount();
			instance._willUpdate();
			syncVirtualState(instance);
			return unmount;
		});

		return () => {
			cleanup();
			virtualizer = null;
		};
	});

	$effect(() => {
		const rows = table.rows;
		if (!virtualizer) return;
		// setOptions REPLACES the options object (merging only with library defaults),
		// so spread the existing options or estimateSize/observers/onChange are lost
		// and the virtualizer throws during hydration.
		virtualizer.setOptions({
			...virtualizer.options,
			count: rows.length,
			getItemKey: (index: number) => rows[index]?.slug ?? index
		} as Parameters<Virtualizer<HTMLDivElement, HTMLDivElement>['setOptions']>[0]);
		// Note: no virtualizer.measure() here — it would clear the per-slug size cache
		// and mounted rows wouldn't re-measure. Sizes are keyed by slug so they stay
		// valid across sorts/filters; new rows measure on mount via bindRowElement.
		syncVirtualState(virtualizer);
	});

	function remeasureList() {
		if (!virtualizer || !listScrollEl) return;
		// Re-read each mounted virtual row from the DOM (their action only re-fires on
		// index change). Deliberately NOT virtualizer.measure(): that clears the whole
		// per-slug size cache, and unmounted rows would collapse back to the 72px
		// estimate — mispositioning everything outside the viewport.
		for (const item of virtualizer.getVirtualItems()) {
			const el = listScrollEl.querySelector<HTMLDivElement>(
				`.virtual-row[data-index="${item.index}"]`
			);
			if (el) virtualizer.measureElement(el);
		}
		syncVirtualState(virtualizer);
	}

	function scheduleRemeasure() {
		tick().then(() => {
			remeasureList();
			requestAnimationFrame(() => remeasureList());
		});
	}

	$effect(() => {
		const slug = appState.listScrollTarget;
		if (!slug || !virtualizer) return;
		appState.selectedRestaurantSlug = slug;
		appState.listScrollTarget = null;
		const index = table.rows.findIndex((r) => r.slug === slug);
		if (index < 0) return;
		tick().then(() => {
			virtualizer?.scrollToIndex(index, {
				align: 'center',
				behavior: reduceMotion() ? 'auto' : 'smooth'
			});
		});
	});

	function toggleRow(restaurant: Restaurant) {
		const slug = restaurant.slug;
		if (appState.selectedRestaurantSlug === slug) {
			appState.selectedRestaurantSlug = null;
		} else {
			appState.selectedRestaurantSlug = slug;
			if (restaurant.lat != null && restaurant.lng != null) {
				appState.mapTarget = { slug, lat: restaurant.lat, lng: restaurant.lng };
			}
		}
		scheduleRemeasure();
	}

	function onDrawerTransitionEnd(e: TransitionEvent) {
		if (e.propertyName === 'grid-template-rows') scheduleRemeasure();
	}

	function bindRowElement(el: HTMLDivElement, index: number) {
		el.dataset.index = String(index);
		virtualizer?.measureElement(el);
		return {
			update(newIndex: number) {
				el.dataset.index = String(newIndex);
				virtualizer?.measureElement(el);
			},
			destroy() {
				virtualizer?.measureElement(null);
			}
		};
	}

	function setHovered(restaurant: Restaurant) {
		appState.hoveredRestaurantSlug = restaurant.slug;
	}

	function showOnMap(restaurant: Restaurant, e: MouseEvent) {
		e.stopPropagation();
		if (restaurant.lat == null || restaurant.lng == null) return;
		appState.mapTarget = { slug: restaurant.slug, lat: restaurant.lat, lng: restaurant.lng };
		appState.selectedRestaurantSlug = restaurant.slug;
		onShowOnMap?.();
		const mapEl = document.querySelector('.map-container');
		if (mapEl) {
			mapEl.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
		}
	}

	function toggleScoreTip(slug: string, e: MouseEvent) {
		e.stopPropagation();
		openScoreTipSlug = openScoreTipSlug === slug ? null : slug;
	}

	function clearHovered(restaurant: Restaurant) {
		// Only clear if we still own the highlight — prevents a trailing
		// mouseleave/blur from one row wiping the highlight a sibling just set.
		if (appState.hoveredRestaurantSlug === restaurant.slug) {
			appState.hoveredRestaurantSlug = null;
		}
	}

	function googleMapsUrl(restaurant: Restaurant): string {
		const query = restaurant.name + ' ' + (restaurant.location || 'Orange County') + ' CA';
		return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
	}


	function shareUrl(slug: string): string {
		return buildCanonicalShareUrl(window.location.origin, window.location.pathname, {
			searchQuery: appState.searchQuery,
			activeCuisines: appState.activeCuisines,
			activeCities: appState.activeCities,
			activeSubreddits: appState.activeSubreddits,
			freshnessCutoff: appState.freshnessCutoff,
			showUnmapped: appState.showUnmapped,
			sortKey: appState.sortKey,
			sortDirection: appState.sortDirection,
			selectedRestaurantSlug: slug
		});
	}

	async function copyShareLink(restaurant: Restaurant) {
		try {
			await navigator.clipboard.writeText(shareUrl(restaurant.slug));
			toast.success('Link copied!');
		} catch {
			toast.error('Could not copy link');
		}
	}

	function onToggleSaved(restaurant: Restaurant, e: MouseEvent) {
		e.stopPropagation();
		const saved = toggleSaved(restaurant.slug);
		if (saved) {
			toast.success(`Saved ${restaurant.name}`);
		} else {
			toast.info(`Removed ${restaurant.name} from saved`);
		}
	}

	function getPrimaryMention(mentions: Mention[]): Mention | null {
		const primaries = mentions.filter((m) => m.role === 'primary');
		if (primaries.length === 0) return null;
		// Defensive: there should be exactly one per restaurant per thread, but
		// pick the highest-scored primary if multiple slipped through.
		return primaries.reduce((best, m) => (m.score > best.score ? m : best), primaries[0]);
	}

	function groupEndorsements(mentions: Mention[]) {
		const groups = {
			dish_rec: [] as Mention[],
			personal_story: [] as Mention[],
			endorsement: [] as Mention[]
		};
		for (const m of mentions) {
			if (m.role !== 'endorsement') continue;
			if (m.classification === 'dish_rec') groups.dish_rec.push(m);
			else if (m.classification === 'personal_story') groups.personal_story.push(m);
			else if (m.classification === 'endorsement') groups.endorsement.push(m);
		}
		return groups;
	}
</script>

<div class="restaurant-list">
	<div class="sort-bar" role="toolbar" aria-label="Sort options">
		<span class="sort-label" id="sort-label">Sort by:</span>
		{#each sortOptions as opt}
			<button
				class="sort-btn"
				class:active={opt.sort.isActive}
				onclick={() => cycleSort(opt.key)}
				aria-pressed={opt.sort.isActive}
			>
				{opt.label}
				{#if opt.sort.isActive && opt.sort.direction}
					<span class="sort-arrow">{opt.sort.direction === 'desc' ? '\u25BC' : '\u25B2'}</span>
				{/if}
			</button>
		{/each}
		<span class="result-count" aria-live="polite">
			{restaurants.length} {restaurants.length === 1 ? 'restaurant' : 'restaurants'}
		</span>
	</div>

	<div class="list-scroll" id="main-content" bind:this={listScrollEl} role="region" aria-label="Restaurant results">
		{#if table.rows.length === 0}
			<div class="empty-state">
				{#if appState.showSavedOnly}
					<span class="empty-icon" aria-hidden="true"><Bookmark size={36} /></span>
					<p class="empty-title">No saved restaurants here</p>
					<p class="empty-hint">
						Tap the bookmark on a restaurant to save it, or adjust your other filters
					</p>
				{:else}
					<span class="empty-icon">&#x1F50D;</span>
					<p class="empty-title">No restaurants found</p>
					<p class="empty-hint">Try adjusting your filters or search terms</p>
				{/if}
			</div>
		{:else}
			<div class="virtual-spacer" style:height="{totalSize}px">
				{#each virtualItems as virtualRow (virtualRow.key)}
					{@const restaurant = table.rows[virtualRow.index]}
					{#if restaurant}
					{@const slug = restaurant.slug}
					{@const isOpen = appState.selectedRestaurantSlug === slug}

					<div
						class="virtual-row"
						style:transform="translateY({virtualRow.start}px)"
						use:bindRowElement={virtualRow.index}
					>
						<div
							class="row"
							class:expanded={isOpen}
							class:hovered={appState.hoveredRestaurantSlug === slug}
							id="restaurant-{slug}"
							role="group"
							aria-label={restaurant.name}
							onmouseenter={() => setHovered(restaurant)}
							onmouseleave={() => clearHovered(restaurant)}
						>
							<div class="row-header">
								<button
									type="button"
									class="row-toggle"
									onclick={() => toggleRow(restaurant)}
									onfocus={() => setHovered(restaurant)}
									onblur={() => clearHovered(restaurant)}
									aria-expanded={isOpen}
									aria-controls={isOpen ? `drawer-${slug}` : undefined}
								>
									<div class="row-main">
										<div class="row-name-line">
											<span class="row-name">{restaurant.name}</span>
											{#if hasNewMentions(restaurant)}
												<span class="tag new-tag" aria-label="New mentions since your last visit">New</span>
											{/if}
										</div>
										<div class="row-tags">
											{#if restaurant.cuisine}
												<span class="tag cuisine-tag">{normalizeCuisine(restaurant.cuisine)}</span>
											{/if}
											{#if restaurant.location}
												<span class="tag location-tag">{restaurant.location}</span>
											{/if}
										</div>
										{#if restaurant.top_dish_snippet}
											<p class="dish-teaser">Try: {restaurant.top_dish_snippet}</p>
										{/if}
									</div>
								</button>
								<div class="row-stats">
									<span class="stat score">
										{restaurant.aggregate_score} <small>pts</small>
									</span>
									<span class="stat">
										{restaurant.endorsement_count} <small>endorse</small>
									</span>
									<span class="stat">
										{restaurant.mention_count} <small>mentions</small>
									</span>
								</div>
								<button
									type="button"
									class="row-save-btn"
									class:saved={isSaved(slug)}
									onclick={(e) => onToggleSaved(restaurant, e)}
									aria-pressed={isSaved(slug)}
									aria-label={isSaved(slug)
										? `Remove ${restaurant.name} from your saved list`
										: `Save ${restaurant.name} to your list`}
								>
									<Bookmark
										size={16}
										fill={isSaved(slug) ? 'currentColor' : 'none'}
										aria-hidden="true"
									/>
								</button>
								<button
									type="button"
									class="row-chevron-btn"
									onclick={() => toggleRow(restaurant)}
									onfocus={() => setHovered(restaurant)}
									onblur={() => clearHovered(restaurant)}
									aria-label="{isOpen ? 'Collapse' : 'Expand'} {restaurant.name} details"
									tabindex="-1"
								>
									<span class="chevron" class:open={isOpen} aria-hidden="true"><ChevronRight size={20} /></span>
								</button>
							</div>

							<div
								class="drawer-reveal"
								class:open={isOpen}
								class:no-motion={reduceMotion()}
								ontransitionend={onDrawerTransitionEnd}
							>
								<div class="drawer-inner">
									{#if isOpen}
										<div class="drawer" id="drawer-{slug}" role="region" aria-label="{restaurant.name} details">
						{#if details[slug] === undefined}
							<p class="drawer-loading">Loading comments…</p>
						{:else}
							{@const mentions = details[slug] ?? []}
							{@const primary = getPrimaryMention(mentions)}
							{@const groups = groupEndorsements(mentions)}
						{#if primary}
							<div class="primary-comment">
								<div class="comment-header">
									<span class="comment-author">u/{primary.author}</span>
									<span class="comment-score">
										{primary.score} points
										<button
											type="button"
											class="info-tip"
											aria-label="Score info"
											aria-expanded={openScoreTipSlug === slug}
											aria-controls="score-tip-{slug}"
											onclick={(e) => toggleScoreTip(slug, e)}
										>
											<span class="info-icon" aria-hidden="true">i</span>
											<span
												id="score-tip-{slug}"
												class="info-tooltip"
												class:open={openScoreTipSlug === slug}
												role="tooltip"
											>
												Total Reddit upvotes across all comments that recommended this restaurant.
											</span>
										</button>
									</span>
								</div>
								<p class="comment-body">{primary.body}</p>
								{#if primary.permalink}
									<a
										href={primary.permalink}
										target="_blank"
										rel="noopener noreferrer"
										class="permalink"
									>
										View on Reddit &rarr;
									</a>
								{/if}
							</div>
						{/if}

						{#if groups.dish_rec.length > 0}
							<div class="endorsement-section">
								<h3>What to Order</h3>
								{#each groups.dish_rec as e (e.comment_id)}
									<div class="endorsement-card">
										<div class="endorsement-meta">
											<span class="endorsement-author">u/{e.author}</span>
											<span class="endorsement-score">{e.score} pts</span>
										</div>
										<p>{e.body}</p>
										{#if e.permalink}
											<a
												href={e.permalink}
												target="_blank"
												rel="noopener noreferrer"
												class="endorsement-permalink"
											>
												View comment &rarr;
											</a>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						{#if groups.personal_story.length > 0}
							<div class="endorsement-section">
								<h3>Community Stories</h3>
								{#each groups.personal_story as e (e.comment_id)}
									<div class="endorsement-card">
										<div class="endorsement-meta">
											<span class="endorsement-author">u/{e.author}</span>
											<span class="endorsement-score">{e.score} pts</span>
										</div>
										<p>{e.body}</p>
										{#if e.permalink}
											<a
												href={e.permalink}
												target="_blank"
												rel="noopener noreferrer"
												class="endorsement-permalink"
											>
												View comment &rarr;
											</a>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						{#if groups.endorsement.length > 0}
							<div class="endorsement-section">
								<h3>Community Love</h3>
								{#each groups.endorsement as e (e.comment_id)}
									<div class="endorsement-card">
										<div class="endorsement-meta">
											<span class="endorsement-author">u/{e.author}</span>
											<span class="endorsement-score">{e.score} pts</span>
										</div>
										<p>{e.body}</p>
										{#if e.permalink}
											<a
												href={e.permalink}
												target="_blank"
												rel="noopener noreferrer"
												class="endorsement-permalink"
											>
												View comment &rarr;
											</a>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						{/if}

										<div class="drawer-actions">
											{#if restaurant.lat && restaurant.lng}
												<button class="map-link" onclick={(e) => showOnMap(restaurant, e)}>
													Show on map
												</button>
											{/if}

											<button type="button" class="share-link" onclick={() => copyShareLink(restaurant)} aria-label="Copy link to {restaurant.name}">
												<svg class="share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
												Copy link
											</button>
											<a
												class="maps-link"
												href={googleMapsUrl(restaurant)}
												target="_blank"
												rel="noopener noreferrer"
												aria-label="Open {restaurant.name} in Google Maps"
											>
												<span class="maps-icon" aria-hidden="true"><MapPin size={14} /></span>
												Google Maps
											</a>
										</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>

<svelte:window
	onclick={() => {
		openScoreTipSlug = null;
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') openScoreTipSlug = null;
	}}
/>

<style>
	.restaurant-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.sort-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #e8e0d6;
		background: #faf7f2;
		flex-shrink: 0;
	}

	.sort-label {
		font-size: 0.8rem;
		color: #7a6e63;
	}

	.sort-btn {
		font-size: 0.8rem;
		padding: 4px 12px;
		border: 1px solid #d4c8bb;
		border-radius: 5px;
		background: #fffcf8;
		cursor: pointer;
		color: #5d4e37;
		transition: all 0.15s ease;
		font-weight: 500;
	}

	.sort-btn:hover {
		border-color: #ff4500;
		color: #ff4500;
	}

	.sort-btn.active {
		background: #ff4500;
		color: #fff;
		border-color: #ff4500;
	}

	.sort-btn:active {
		transform: scale(0.96);
	}

	.sort-arrow {
		font-size: 0.65rem;
		margin-left: 2px;
	}

	.result-count {
		margin-left: auto;
		font-size: 0.78rem;
		color: #7a6e63;
		font-variant-numeric: tabular-nums;
	}

	.list-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.virtual-spacer {
		position: relative;
		width: 100%;
	}

	.virtual-row {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
	}

	.drawer-reveal {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.2s ease;
	}

	.drawer-reveal.open {
		grid-template-rows: 1fr;
	}

	.drawer-reveal.open .drawer-inner {
		overflow: visible;
	}

	.drawer-reveal.no-motion {
		transition: none;
	}

	.drawer-inner {
		overflow: hidden;
		min-height: 0;
	}

	@media (max-width: 1023px) {
		.list-scroll {
			padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px));
		}
	}

	.row {
		border-bottom: 1px solid #efe8e0;
		border-left: 3px solid transparent;
		transition: background-color 0.15s ease, border-left-color 0.18s ease-in-out;
	}

	.row.expanded {
		background: #faf7f2;
		border-left-color: #ff4500;
		position: relative;
		z-index: 1;
	}

	.row-header {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.6rem 0.75rem;
		gap: 0.75rem;
		transition: background-color 0.15s ease;
	}

	.row-header:hover {
		background: rgba(62, 44, 35, 0.02);
	}

	.row-toggle,
	.row-chevron-btn {
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		text-align: left;
	}

	.row-toggle {
		flex: 1;
		min-width: 0;
	}

	.row-chevron-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
	}

	.row-save-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		cursor: pointer;
		/* 16px icon padded to a ~36px hit target without widening the row visually */
		padding: 10px;
		margin: -10px -6px;
		border-radius: 50%;
		color: #d4c8bb;
		transition: color 0.15s ease, transform 0.1s ease;
	}

	.row-save-btn:hover {
		color: #ff4500;
	}

	.row-save-btn:active {
		transform: scale(0.9);
	}

	.row-save-btn.saved {
		color: #ff4500;
	}

	.row:hover {
		border-left-color: #ff4500;
	}

	/* Reverse highlight: pin hover/focus on the map lights up the matching row */
	.row.hovered {
		border-left-color: #ff4500;
		background: rgba(255, 69, 0, 0.04);
	}

	/* Selected row keeps its stronger cream fill even while hovered */
	.row.expanded.hovered {
		background: #faf7f2;
	}

	.row-main {
		flex: 1;
		min-width: 0;
	}

	.row-name-line {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.row-name {
		overflow-wrap: anywhere;
		font-family: 'DM Serif Display', Georgia, serif;
		font-weight: 400;
		font-size: 1rem;
		color: #3e2c23;
	}

	.new-tag {
		background: #ff4500;
		color: #fff;
		font-weight: 600;
		font-size: 0.65rem;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.row-tags {
		display: flex;
		gap: 0.35rem;
		margin-top: 2px;
		flex-wrap: wrap;
	}

	.tag {
		font-size: 0.72rem;
		padding: 2px 7px;
		border-radius: 4px;
		letter-spacing: 0.01em;
	}

	.cuisine-tag {
		background: #f0ebe3;
		color: #5d4e37;
	}

	.location-tag {
		background: #fce8e0;
		color: #b5543a;
	}

	.row-stats {
		display: flex;
		gap: 0.75rem;
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	.stat {
		font-size: 0.82rem;
		color: #5d4e37;
		white-space: nowrap;
	}

	.stat.score {
		color: #ff4500;
		font-weight: 700;
		position: relative;
	}

	.info-tip {
		position: relative;
		display: inline-flex;
		align-items: center;
		vertical-align: middle;
		padding: 6px;
		margin: -6px -6px -6px -4px;
		border: 0;
		background: transparent;
	}

	.info-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1px solid #d4c8bb;
		font-size: 0.6rem;
		font-weight: 700;
		font-style: italic;
		color: #7a6e63;
		cursor: help;
		line-height: 1;
	}

	.info-tooltip {
		display: none;
		position: absolute;
		top: calc(100% + 6px);
		right: -8px;
		width: 200px;
		padding: 6px 8px;
		background: #333;
		color: #fff;
		font-size: 0.72rem;
		font-weight: 400;
		font-style: normal;
		line-height: 1.4;
		border-radius: 6px;
		white-space: normal;
		z-index: 10;
		pointer-events: none;
	}

	.info-tip:hover .info-tooltip,
	.info-tip:focus .info-tooltip,
	.info-tooltip.open {
		display: block;
	}

	.dish-teaser {
		margin: 0.25rem 0 0;
		font-size: 0.78rem;
		color: #7a6e63;
		line-height: 1.35;
		font-style: italic;
	}

	.stat small {
		font-size: 0.7rem;
		font-weight: 400;
		color: #7a6e63;
	}

	.chevron {
		color: #d4c8bb;
		display: inline-flex;
		align-items: center;
		transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		flex-shrink: 0;
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.row-header:hover .chevron,
	.row-toggle:focus-visible ~ .row-chevron-btn .chevron {
		color: #ff4500;
	}

	.drawer {
		padding: 0.75rem 1rem 1rem;
		border-top: 1px solid #e8e0d6;
	}

	.drawer-loading {
		padding: 0.5rem 0;
		font-size: 0.85rem;
		color: #7a6e63;
	}

	.primary-comment {
		background: #fffcf8;
		border: none;
		border-left: 3px solid #ff4500;
		border-radius: 0 8px 8px 0;
		padding: 0.75rem 0.75rem 0.75rem 1rem;
		margin-bottom: 0.75rem;
		box-shadow: 0 1px 3px rgba(62, 44, 35, 0.04);
	}

	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.35rem;
	}

	.comment-author {
		font-size: 0.72rem;
		font-weight: 500;
		color: #7a6e63;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.comment-score {
		font-size: 0.78rem;
		color: #ff4500;
		font-weight: 600;
	}

	.comment-body {
		font-family: 'DM Serif Display', Georgia, serif;
		font-size: 1rem;
		font-style: italic;
		line-height: 1.5;
		color: #3e2c23;
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.permalink {
		display: inline-block;
		margin-top: 0.4rem;
		font-size: 0.78rem;
		color: #ff4500;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
		transition: text-decoration-thickness 0.15s ease;
	}

	.permalink:hover {
		text-decoration-thickness: 2px;
	}

	.endorsement-section {
		margin-bottom: 0.75rem;
	}

	.endorsement-section h3 {
		font-family: 'DM Sans', sans-serif;
		font-size: 0.72rem;
		color: #7a6e63;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 600;
		margin: 0 0 0.4rem;
		padding-bottom: 0.2rem;
		border-bottom: 1px solid #e8e0d6;
	}

	.endorsement-card {
		background: #fffcf8;
		border: 1px solid #efe8e0;
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		margin-bottom: 0.35rem;
	}

	.endorsement-meta {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.2rem;
	}

	.endorsement-author {
		font-size: 0.72rem;
		color: #7a6e63;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.endorsement-score {
		font-size: 0.75rem;
		color: #ff4500;
		font-weight: 600;
	}

	.endorsement-card p {
		overflow-wrap: anywhere;
		font-size: 0.85rem;
		line-height: 1.5;
		color: #3e2c23;
		margin: 0;
	}

	.endorsement-permalink {
		display: inline-block;
		margin-top: 0.35rem;
		font-size: 0.72rem;
		color: #ff4500;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
		transition: text-decoration-thickness 0.15s ease;
	}

	.endorsement-permalink:hover {
		text-decoration-thickness: 2px;
	}

	.drawer-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.map-link {
		font-size: 0.8rem;
		padding: 5px 14px;
		border-radius: 6px;
		cursor: pointer;
		border: 1px solid #ff4500;
		background: #fffcf8;
		color: #ff4500;
		transition: all 0.15s ease;
		font-weight: 500;
	}

	.map-link:hover {
		background: #ff4500;
		color: #fff;
		box-shadow: 0 2px 6px rgba(255, 69, 0, 0.15);
	}

	.map-link:active {
		transform: scale(0.97);
	}


	.share-link { display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; padding: 5px 14px; border-radius: 6px; cursor: pointer; border: 1px solid #d4c8bb; background: #fffcf8; color: #5d4e37; transition: all 0.15s ease; font-weight: 500; }
	.share-link:hover { border-color: #ff4500; color: #ff4500; box-shadow: 0 2px 6px rgba(255, 69, 0, 0.1); }
	.share-link:active { transform: scale(0.97); }
	.share-icon { width: 14px; height: 14px; flex-shrink: 0; }

	.maps-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8rem;
		padding: 5px 14px;
		border-radius: 6px;
		border: 1px solid #d4c8bb;
		background: #fffcf8;
		color: #5d4e37;
		text-decoration: none;
		transition: all 0.15s ease;
		font-weight: 500;
	}

	.maps-link:hover {
		border-color: #5d4e37;
		background: #5d4e37;
		color: #fffcf8;
		box-shadow: 0 2px 6px rgba(62, 44, 35, 0.12);
	}

	.maps-link:active {
		transform: scale(0.97);
	}

	.maps-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		text-align: center;
	}

	.empty-icon {
		font-size: 2.5rem;
		margin-bottom: 0.75rem;
		opacity: 0.7;
	}

	.empty-title {
		font-family: 'DM Serif Display', Georgia, serif;
		font-size: 1.1rem;
		font-weight: 400;
		color: #3e2c23;
		margin: 0 0 0.25rem;
	}

	.empty-hint {
		font-size: 0.85rem;
		color: #7a6e63;
		margin: 0;
	}

</style>
