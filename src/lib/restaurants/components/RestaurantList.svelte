<script lang="ts">
	import { Bookmark, ChevronRight, MapPin } from 'lucide-svelte';
	import { getTrimmedSnippet } from '$lib/restaurants/snippet';
	import { tick, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
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
	import {
		nextSortState,
		sortButtonAccessibleName,
		sortDirectionShort
	} from '$lib/restaurants/sort-cycle';
	import {
		appState,
		clearExplorerFilters,
		isUnmappedRestaurant,
		latestMentionMs,
		normalizeCuisine
	} from '$lib/restaurants/stores.svelte';
	import { buildCanonicalShareUrl } from '$lib/restaurants/page-meta';
	import { isSaved, toggleSaved } from '$lib/restaurants/saved-restaurants.svelte';
	import { getLastVisitMs, hasNewMentionsSince } from '$lib/restaurants/visit-tracker';
	import { consumeSkipToList } from '$lib/restaurants/skip-to-list';
	import { onMount } from 'svelte';
	import { toast } from '$lib/toast';

	interface Props {
		restaurants: Restaurant[];
		onShowOnMap?: (opener: HTMLButtonElement) => void;
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
	let detailErrors = $state<Record<string, boolean>>({});
	let openScoreTipSlug = $state<string | null>(null);
	async function loadDetail(slug: string, { force = false } = {}) {
		if (!force && details[slug] !== undefined) return;
		if (force) {
			const next = { ...details };
			delete next[slug];
			details = next;
			const nextErrors = { ...detailErrors };
			delete nextErrors[slug];
			detailErrors = nextErrors;
		}
		try {
			const res = await fetch(`/api/r/${slug}.json`);
			if (!res.ok) {
				details[slug] = [];
				detailErrors[slug] = true;
				toast.error('Could not load mentions');
				return;
			}
			details[slug] = await res.json();
			if (detailErrors[slug]) {
				const nextErrors = { ...detailErrors };
				delete nextErrors[slug];
				detailErrors = nextErrors;
			}
		} catch {
			details[slug] = [];
			detailErrors[slug] = true;
			toast.error('Could not load mentions');
		}
	}

	function retryDetail(slug: string) {
		void loadDetail(slug, { force: true });
	}

	// Load detail whenever a restaurant becomes selected (row tap, search, map, or URL).
	// untrack: loadDetail reads `details[slug]`, and we must not re-fire this effect when
	// the cache updates (or a Retry would double-fetch after clearing the failed entry).
	$effect(() => {
		const slug = appState.selectedRestaurantSlug;
		if (!slug) return;
		untrack(() => {
			void loadDetail(slug);
		});
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
		{ key: 'score' as const, label: 'Score', sort: scoreSort },
		{ key: 'recency' as const, label: 'Recent', sort: recencySort },
		{ key: 'name' as const, label: 'Name', sort: nameSort }
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
		// Named two-state sort: restore() after setRows can leave the wrong key
		// (first paint) or the wrong direction (URL hydration that only changes sortdir).
		if (
			opt &&
			(!opt.sort.isActive || opt.sort.direction !== appState.sortDirection)
		) {
			applySortFromAppState();
		}
	});

	function cycleSort(key: SortKey) {
		const next = nextSortState(appState.sortKey, appState.sortDirection, key);
		appState.sortKey = next.sortKey;
		appState.sortDirection = next.sortDirection;
		applySortFromAppState();
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
	// rows never re-measure (their attach only re-fires on index change), so rows
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
		// valid across sorts/filters; new rows measure on mount via bindRowElement attach.
		syncVirtualState(virtualizer);
	});

	function remeasureList() {
		if (!virtualizer || !listScrollEl) return;
		// Re-read each mounted virtual row from the DOM (their attach only re-fires on
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

	function rowToggleLabel(restaurant: Restaurant): string {
		const parts = [restaurant.name];
		if (restaurant.cuisine) parts.push(normalizeCuisine(restaurant.cuisine));
		if (restaurant.location) parts.push(restaurant.location);
		if (restaurant.endorsement_count >= 15) parts.push('popular');
		if (hasNewMentions(restaurant)) parts.push('new since last visit');
		if (isUnmappedRestaurant(restaurant)) parts.push('not on the map');
		return parts.join(', ');
	}

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

	// Attachment equivalent of the former use: action — re-runs when index changes
	// (same timing as action update) so the virtualizer keeps accurate row heights.
	function bindRowElement(index: number): Attachment<HTMLDivElement> {
		return (el) => {
			el.dataset.index = String(index);
			virtualizer?.measureElement(el);
			return () => {
				virtualizer?.measureElement(null);
			};
		};
	}

	const bindListScroll: Attachment<HTMLDivElement> = (el) => {
		listScrollEl = el;
		if (consumeSkipToList()) {
			void tick().then(() => {
				if (listScrollEl === el) el.focus();
			});
		}
		return () => {
			listScrollEl = undefined;
		};
	};

	function setHovered(restaurant: Restaurant) {
		appState.hoveredRestaurantSlug = restaurant.slug;
	}

	function showOnMap(
		restaurant: Restaurant,
		e: MouseEvent & { currentTarget: HTMLButtonElement }
	) {
		e.stopPropagation();
		if (restaurant.lat == null || restaurant.lng == null) return;
		appState.mapTarget = { slug: restaurant.slug, lat: restaurant.lat, lng: restaurant.lng };
		appState.selectedRestaurantSlug = restaurant.slug;
		onShowOnMap?.(e.currentTarget);
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

	function hasDrawerCommentContent(
		primary: Mention | null,
		groups: ReturnType<typeof groupEndorsements>
	) {
		return Boolean(
			primary ||
				groups.dish_rec.length > 0 ||
				groups.personal_story.length > 0 ||
				groups.endorsement.length > 0
		);
	}

	function relativeDate(isoDate: string | null): string {
		if (!isoDate) return '';
		const d = new Date(isoDate);
		const now = Date.now();
		const diffMs = now - d.getTime();
		const days = Math.floor(diffMs / 86_400_000);
		if (days < 1) return 'today';
		if (days === 1) return 'yesterday';
		if (days < 30) return `${days}d ago`;
		const months = Math.floor(days / 30);
		if (months < 12) return `${months}mo ago`;
		const years = Math.floor(months / 12);
		return `${years}y ago`;
	}
</script>

<div class="restaurant-list">
	<div class="sort-bar" role="toolbar" aria-label="Sort options">
		<span class="sort-label" id="sort-label">Sort by:</span>
		{#each sortOptions as opt (opt.key)}
			<button
				type="button"
				class="sort-btn"
				class:active={opt.sort.isActive}
				onclick={() => cycleSort(opt.key)}
				aria-pressed={opt.sort.isActive}
				aria-label={sortButtonAccessibleName(
					opt.key,
					opt.label,
					opt.sort.isActive,
					opt.sort.direction
				)}
			>
				{opt.label}
				{#if opt.sort.isActive}
					<span class="sort-dir" aria-hidden="true">{sortDirectionShort(opt.key, opt.sort.direction)}</span>
				{/if}
			</button>
		{/each}
		<span class="result-count" aria-live="polite">
			{restaurants.length}
			<span class="result-count-noun">{restaurants.length === 1 ? 'restaurant' : 'restaurants'}</span>
		</span>
	</div>

	<div
		class="list-scroll"
		id="main-content"
		tabindex="-1"
		{@attach bindListScroll}
		role="region"
		aria-label="Restaurant results"
	>
		{#if table.rows.length === 0}
			<div class="empty-state">
				{#if appState.showSavedOnly}
					<span class="empty-icon" aria-hidden="true"><Bookmark size={36} /></span>
					<p class="empty-title">No saved restaurants here</p>
					<p class="empty-hint">
						Tap the bookmark on a restaurant to save it, or adjust your other filters
					</p>
					<button
						type="button"
						class="empty-action"
						onclick={() => clearExplorerFilters({ includeSearch: true })}
					>
						Show all restaurants
					</button>
				{:else}
					<span class="empty-icon" aria-hidden="true">&#x1F50D;</span>
					<p class="empty-title">No restaurants found</p>
					<p class="empty-hint">Try adjusting your filters or search terms</p>
					<button
						type="button"
						class="empty-action"
						onclick={() => clearExplorerFilters({ includeSearch: true })}
					>
						Clear filters
					</button>
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
						{@attach bindRowElement(virtualRow.index)}
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
								<h2 class="row-heading">
									<button
										type="button"
										class="row-toggle"
										onclick={() => toggleRow(restaurant)}
										onfocus={() => setHovered(restaurant)}
										onblur={() => clearHovered(restaurant)}
										aria-label={rowToggleLabel(restaurant)}
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
												{#if restaurant.endorsement_count >= 15}
													<span class="tag popular-tag" aria-label="Highly endorsed community favorite">🔥 Popular</span>
												{/if}
												{#if restaurant.cuisine}
													<span class="tag cuisine-tag">{normalizeCuisine(restaurant.cuisine)}</span>
												{/if}
												{#if restaurant.location}
													<span class="tag location-tag">{restaurant.location}</span>
												{/if}
												{#if isUnmappedRestaurant(restaurant)}
													<span class="tag unmapped-tag">Unmapped</span>
												{/if}
											</div>
											{#if restaurant.top_comment_snippet}
												{@const snippet = getTrimmedSnippet(restaurant.top_comment_snippet, restaurant.name, 150)}
												<p class="dish-teaser">
													“{#each snippet.segments as segment, i (i)}{#if segment.isMatch}<strong>{segment.text}</strong>{:else}{segment.text}{/if}{/each}”
												</p>
											{/if}
										</div>
									</button>
								</h2>
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
								<span
									class="row-chevron-btn"
									onclick={() => toggleRow(restaurant)}
									aria-hidden="true"
								>
									<span class="chevron" class:open={isOpen} aria-hidden="true"><ChevronRight size={20} /></span>
								</span>
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
							<div
								class="drawer-skeleton"
								class:no-motion={reduceMotion()}
								aria-busy="true"
								aria-live="polite"
							>
								<span class="skeleton-status">Loading comments…</span>
								<div class="skeleton-primary" aria-hidden="true">
									<div class="skeleton-meta">
										<span class="skeleton-line short"></span>
										<span class="skeleton-line score"></span>
									</div>
									<span class="skeleton-line body"></span>
									<span class="skeleton-line body"></span>
									<span class="skeleton-line body medium"></span>
								</div>
								<div class="skeleton-section" aria-hidden="true">
									<span class="skeleton-line heading"></span>
									<div class="skeleton-card">
										<span class="skeleton-line short"></span>
										<span class="skeleton-line"></span>
										<span class="skeleton-line medium"></span>
									</div>
								</div>
							</div>
						{:else if detailErrors[slug]}
							<div class="drawer-status" role="alert">
								<p class="drawer-status-title">Could not load comments</p>
								<p class="drawer-status-hint">Check your connection, then try again.</p>
								<button type="button" class="drawer-retry" onclick={() => retryDetail(slug)}>
									Retry
								</button>
							</div>
						{:else}
							{@const mentions = details[slug] ?? []}
							{@const primary = getPrimaryMention(mentions)}
							{@const groups = groupEndorsements(mentions)}
							{@const hasComments = hasDrawerCommentContent(primary, groups)}
								<div class="drawer-content" class:no-motion={reduceMotion()}>
									{#if primary}
										<div class="primary-comment">
											<div class="comment-header">
												<span class="comment-author">
													u/{primary.author}
													{#if primary.comment_date}
														<span class="comment-date"> · {relativeDate(primary.comment_date)}</span>
													{/if}
												</span>
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
													</button>
													<span
														id="score-tip-{slug}"
														class="info-tooltip"
														class:open={openScoreTipSlug === slug}
														role="tooltip"
													>
														Reddit upvotes on this recommendation comment.
													</span>
												</span>
											</div>
											<p class="comment-body">{primary.body}</p>
											{#if primary.permalink}
									<!-- External absolute URLs (Reddit/Maps below): do not wrap in resolve() — that is for in-app routes only. -->
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
											<span class="endorsement-author">
												u/{e.author}{#if e.comment_date}<span class="comment-date"> · {relativeDate(e.comment_date)}</span>{/if}
											</span>
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
											<span class="endorsement-author">
												u/{e.author}{#if e.comment_date}<span class="comment-date"> · {relativeDate(e.comment_date)}</span>{/if}
											</span>
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
											<span class="endorsement-author">
												u/{e.author}{#if e.comment_date}<span class="comment-date"> · {relativeDate(e.comment_date)}</span>{/if}
											</span>
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

						{#if !hasComments}
							<div class="drawer-status" role="status">
								<p class="drawer-status-title">No comments to show</p>
								<p class="drawer-status-hint">
									This place is on the list, but full comment text is not available yet.
								</p>
							</div>
						{/if}
							</div>
						{/if}

										{#if isUnmappedRestaurant(restaurant)}
											<p class="unmapped-drawer-hint">
												This place isn’t pinned on the map yet. Google Maps can still search for it by name.
											</p>
										{/if}

										<div class="drawer-actions" role="group" aria-label="Restaurant actions">
											{#if restaurant.lat && restaurant.lng}
												<button type="button" class="map-link" onclick={(e) => showOnMap(restaurant, e)}>
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
		border-bottom: 1px solid rgba(232, 224, 214, 0.7);
		background: rgba(250, 247, 242, 0.85);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		flex-shrink: 0;
		z-index: 10;
		position: sticky;
		top: 0;
	}

	.sort-label {
		font-size: 0.8rem;
		color: #7a6e63;
	}

	.sort-btn {
		font-family: inherit;
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
		color: #c43700;
	}

	.sort-btn.active {
		background: #c43700;
		color: #fff;
		border-color: #c43700;
	}

	.sort-btn:active {
		transform: scale(0.96);
	}

	.sort-btn:focus-visible {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	.sort-btn.active:focus-visible {
		outline-color: #fff;
		box-shadow: 0 0 0 2px #c43700;
	}

	.sort-dir {
		font-size: 0.8rem;
		font-weight: 600;
		margin-left: 0.15rem;
		opacity: 0.92;
		white-space: nowrap;
	}

	@media (max-width: 1023px) {
		.sort-bar {
			flex-wrap: nowrap;
			overflow-x: auto;
			overscroll-behavior-x: contain;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
		}

		.sort-bar::-webkit-scrollbar {
			display: none;
		}

		.sort-label {
			display: none;
		}

		.sort-btn {
			min-height: 44px;
			padding-top: 0;
			padding-bottom: 0;
			flex-shrink: 0;
		}

		.result-count {
			flex-shrink: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sort-btn {
			transition: none;
		}

		.sort-btn:active,
		.map-link:active,
		.share-link:active,
		.maps-link:active {
			transform: none;
		}
	}

	.result-count {
		margin-left: auto;
		font-size: 0.78rem;
		color: #7a6e63;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 360px) {
		.result-count-noun {
			display: none;
		}
	}

	.list-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		container-type: inline-size;
		container-name: list-pane;
	}

	.list-scroll:focus {
		outline: none;
	}

	.list-scroll:focus-visible {
		outline: 2px solid #ff4500;
		outline-offset: -2px;
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
		transition: background-color 0.15s ease, border-left-color 0.18s ease-in-out, transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s ease;
		background: #fff;
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

	.row-heading {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		font: inherit;
		/* Flex, not block: an h2 line box would offset .row-toggle from .row-stats. */
		display: flex;
	}

	.row-toggle {
		flex: 1;
		width: 100%;
		min-width: 0;
	}

	.row-toggle:focus-visible {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
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
		color: #7a6e63;
		transition: color 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.row-save-btn:hover {
		color: #c43700;
		transform: scale(1.15);
	}

	.row-save-btn:active {
		transform: scale(0.9);
	}

	.row-save-btn.saved {
		color: #c43700;
		animation: save-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes save-pop {
		0% { transform: scale(1); }
		50% { transform: scale(1.35); }
		100% { transform: scale(1); }
	}

	.row:hover {
		border-left-color: #ff4500;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(62, 44, 35, 0.04);
		z-index: 2;
		position: relative;
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
		background: #c43700;
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
		color: #a04430;
	}

	.popular-tag {
		background: #fff0eb;
		color: #c43700;
		border: 1px solid #ffcca8;
		font-weight: 600;
		font-size: 0.68rem;
	}

	.unmapped-tag {
		background: #e8ece8;
		color: #3d5a45;
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
		background: #c43700;
		color: #fff;
		font-weight: 700;
		position: relative;
		padding: 2px 8px;
		border-radius: 12px;
		display: inline-flex;
		align-items: center;
	}

	.stat.score small {
		color: rgba(255, 255, 255, 0.9);
		margin-left: 2px;
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

	.info-tip:hover + .info-tooltip,
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
	.row-heading:has(.row-toggle:focus-visible) ~ .row-chevron-btn .chevron {
		color: #c43700;
	}

	.drawer {
		padding: 0.75rem 1rem 1rem;
		border-top: 1px solid #e8e0d6;
	}

	.drawer-content {
		animation: drawer-content-in 0.28s ease;
	}

	.drawer-content.no-motion {
		animation: none;
	}

	.drawer-status {
		padding: 0.85rem 0.15rem 0.35rem;
		text-align: left;
	}

	.drawer-status-title {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 600;
		color: #3e2c23;
	}

	.drawer-status-hint {
		margin: 0.35rem 0 0;
		font-size: 0.82rem;
		line-height: 1.4;
		color: #7a6e63;
	}

	.drawer-retry {
		margin-top: 0.65rem;
		padding: 6px 12px;
		border: 1px solid #e4d9ce;
		border-radius: 8px;
		background: #fffcf8;
		color: #c43700;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}

	.drawer-retry:hover {
		border-color: #ff4500;
		background: #fff5f0;
	}

	.drawer-retry:focus-visible {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	@keyframes drawer-content-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.drawer-skeleton {
		padding: 0.25rem 0 0.15rem;
		min-height: 11.5rem;
	}

	.skeleton-status {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.skeleton-primary {
		background: #fffcf8;
		border-left: 3px solid #e8d5cc;
		border-radius: 0 8px 8px 0;
		padding: 0.75rem 0.75rem 0.75rem 1rem;
		margin-bottom: 0.75rem;
		box-shadow: 0 1px 3px rgba(62, 44, 35, 0.04);
	}

	.skeleton-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.55rem;
	}

	.skeleton-section {
		margin-bottom: 0.65rem;
	}

	.skeleton-card {
		background: #fffcf8;
		border: 1px solid #efe8e0;
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.skeleton-line {
		display: block;
		height: 0.7rem;
		border-radius: 4px;
		background: linear-gradient(110deg, #efe8e0 8%, #fbf8f4 18%, #efe8e0 33%);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.5s linear infinite;
		margin-bottom: 0.4rem;
		width: 100%;
	}

	.skeleton-line.short {
		width: 28%;
		margin-bottom: 0;
	}

	.skeleton-line.score {
		width: 18%;
		margin-bottom: 0;
	}

	.skeleton-line.body {
		height: 0.85rem;
		margin-bottom: 0.45rem;
	}

	.skeleton-line.medium {
		width: 62%;
		margin-bottom: 0;
	}

	.skeleton-line.heading {
		width: 34%;
		height: 0.55rem;
		margin-bottom: 0.45rem;
	}

	.drawer-skeleton.no-motion .skeleton-line {
		animation: none;
		background: #efe8e0;
	}

	@keyframes skeleton-shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
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

	.comment-date {
		text-transform: none;
		letter-spacing: normal;
		font-weight: 400;
		color: #7a6e63;
	}

	.comment-score {
		position: relative;
		font-size: 0.78rem;
		color: #c43700;
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
		color: #c43700;
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
		color: #c43700;
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
		color: #c43700;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
		transition: text-decoration-thickness 0.15s ease;
	}

	.endorsement-permalink:hover {
		text-decoration-thickness: 2px;
	}

	.unmapped-drawer-hint {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		line-height: 1.4;
		color: #5d4e37;
	}

	.drawer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.map-link {
		display: inline-flex;
		align-items: center;
		font-family: inherit;
		font-size: 0.8rem;
		padding: 5px 14px;
		border-radius: 6px;
		cursor: pointer;
		border: 1px solid #c43700;
		background: #fffcf8;
		color: #c43700;
		transition: all 0.15s ease;
		font-weight: 500;
	}

	.map-link:hover {
		background: #c43700;
		color: #fff;
		box-shadow: 0 2px 6px rgba(255, 69, 0, 0.15);
	}

	.map-link:active {
		transform: scale(0.97);
	}


	.share-link { display: inline-flex; align-items: center; gap: 4px; font-family: inherit; font-size: 0.8rem; padding: 5px 14px; border-radius: 6px; cursor: pointer; border: 1px solid #d4c8bb; background: #fffcf8; color: #5d4e37; transition: all 0.15s ease; font-weight: 500; }
	.share-link:hover { border-color: #ff4500; color: #c43700; box-shadow: 0 2px 6px rgba(255, 69, 0, 0.1); }
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

	.map-link:focus-visible,
	.share-link:focus-visible,
	.maps-link:focus-visible {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	.maps-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	@media (max-width: 1023px) {
		.drawer {
			display: flex;
			flex-direction: column;
		}

		.unmapped-drawer-hint,
		.drawer-actions {
			order: -1;
		}

		.unmapped-drawer-hint {
			margin-top: 0;
			margin-bottom: 0.5rem;
		}

		.drawer-actions {
			margin-top: 0;
			margin-bottom: 0.75rem;
		}

		.map-link,
		.share-link,
		.maps-link {
			min-height: 44px;
			min-width: 44px;
			padding-top: 0;
			padding-bottom: 0;
			box-sizing: border-box;
		}

		.empty-action {
			min-height: 44px;
			padding-top: 0;
			padding-bottom: 0;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
		}
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

	.empty-action {
		margin-top: 1rem;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.45rem 1.1rem;
		border-radius: 8px;
		border: 1px solid #c43700;
		background: #fffcf8;
		color: #c43700;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease,
			transform 0.12s ease;
	}

	.empty-action:hover {
		background: #c43700;
		color: #fff;
		box-shadow: 0 2px 8px rgba(255, 69, 0, 0.16);
	}

	.empty-action:active {
		transform: scale(0.97);
	}

	@media (max-width: 600px) {
		.row-header {
			gap: 0.5rem;
		}

		.row-save-btn,
		.row-chevron-btn {
			width: 44px;
			height: 44px;
			padding: 0;
			margin: 0;
			justify-content: center;
		}

		.dish-teaser {
			display: -webkit-box;
			overflow: hidden;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}
	}

	@container list-pane (max-width: 480px) {
		.row-header {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 44px;
			grid-template-rows: auto 44px;
			column-gap: 0.5rem;
			row-gap: 0.5rem;
			align-items: start;
			padding: 0.75rem 0.75rem 0.5625rem;
		}

		.row-heading {
			grid-column: 1 / -1;
			grid-row: 1;
			width: 100%;
		}

		.row-toggle {
			width: 100%;
		}

		.row-name-line {
			padding-right: 3.25rem;
		}

		.row-save-btn {
			grid-column: 2;
			grid-row: 1;
			margin-top: -0.5rem;
			justify-self: end;
		}

		.row-header::before {
			content: '';
			grid-column: 1 / -1;
			grid-row: 2;
			height: 0;
			border-top: 1px solid #e8e0d6;
			align-self: start;
			pointer-events: none;
		}

		.row-stats {
			grid-column: 1;
			grid-row: 2;
			align-self: stretch;
			align-items: center;
			gap: 0.75rem;
		}

		.row-chevron-btn {
			grid-column: 2;
			grid-row: 2;
		}

		.row-name {
			font-size: 1.25rem;
			line-height: 1.2;
		}

		.dish-teaser {
			margin-top: 0.5rem;
			font-size: 0.875rem;
			font-style: normal;
			line-height: 1.43;
		}
	}

</style>
