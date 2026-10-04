<script lang="ts">
	import type { FuseResult } from 'fuse.js';
	import { Search, X } from 'lucide-svelte';
	import type { Restaurant } from '$lib/restaurants/types';
	import { appState, findFilterMatch } from '$lib/restaurants/stores.svelte';
	import {
		getCachedRestaurantFuse,
		getNameMatchTier,
		rankSearchResults,
		type SearchableRestaurant
	} from '$lib/restaurants/search-restaurants';
	import { normalizeSearchText } from '$lib/restaurants/normalize-name';
	import { SEARCH_DEBOUNCE_MS, scheduleDebounced } from '$lib/debounce';
	import { trackEvent } from '$lib/events';
	import type { CommentSearchHit } from '$lib/restaurants/comment-search';

	interface Props {
		restaurants: Restaurant[];
		cuisineNames: string[];
		cityNames: string[];
		commentMatches?: CommentSearchHit[];
		commentQuery?: string;
		commentSearchStatus?: 'idle' | 'loading' | 'ready' | 'error';
		commentLimitReached?: boolean;
	}

	type FilterMatch = { type: 'cuisine' | 'city'; value: string };
	type SearchOption =
		| { kind: 'filter'; match: FilterMatch; id: 'search-option-filter' }
		| { kind: 'restaurant'; restaurant: Restaurant; id: string; quote?: string };

	let { restaurants, cuisineNames, cityNames, commentMatches = [], commentQuery = '', commentSearchStatus = 'idle', commentLimitReached = false }: Props = $props();

	let inputEl: HTMLInputElement | undefined = $state();
	let showDropdown = $state(false);
	let highlightIndex = $state(-1);

	// The shared, memoized index is only built once the field is first used.
	let fuseRequested = $state(false);
	function ensureFuse() {
		fuseRequested = true;
	}

	// Keystrokes stay instant in the input; the typeahead search waits like the list and map.
	let debouncedQuery = $state(appState.searchQuery);
	$effect(() => {
		const q = appState.searchQuery;
		if (q === debouncedQuery) return;
		if (!q.trim()) {
			debouncedQuery = q;
			return;
		}
		return scheduleDebounced(() => {
			debouncedQuery = q;
		}, SEARCH_DEBOUNCE_MS);
	});

	let queryTrimmed = $derived(debouncedQuery.trim());

	let results = $derived.by(() => {
		if (!fuseRequested || !queryTrimmed) return [] as FuseResult<SearchableRestaurant>[];
		const fuse = getCachedRestaurantFuse(restaurants);
		return rankSearchResults(fuse.search(queryTrimmed), queryTrimmed).slice(0, 10);
	});

	let filterMatch = $derived.by(() =>
		queryTrimmed ? findFilterMatch(queryTrimmed, cuisineNames, cityNames) : null
	);

	// A restaurant whose name equals/starts with the query beats a synonym-derived filter
	// ("Pho 79" must open Pho 79, not filter to Vietnamese). Typing a cuisine or city name
	// outright still prefers the filter.
	let restaurantNameWins = $derived.by(() => {
		if (!filterMatch || results.length === 0) return false;
		if (filterMatch.value.toLowerCase() === queryTrimmed.toLowerCase()) return false;
		return (
			getNameMatchTier(results[0].item.nameNormalized, normalizeSearchText(queryTrimmed)) <= 1
		);
	});

	let options = $derived.by((): SearchOption[] => {
		const list: SearchOption[] = [];
		const filterOption: SearchOption | null = filterMatch
			? { kind: 'filter', match: filterMatch, id: 'search-option-filter' }
			: null;
		if (filterOption && !restaurantNameWins) list.push(filterOption);
		for (const result of results) {
			list.push({
				kind: 'restaurant',
				restaurant: result.item,
				id: `search-option-${result.item.slug}`
			});
		}
		if (filterOption && restaurantNameWins) list.splice(1, 0, filterOption);
		if (queryTrimmed && queryTrimmed === commentQuery && appState.searchQuery.trim() === commentQuery) {
			const seen = new Set(list.filter((option) => option.kind === 'restaurant').map((option) => option.restaurant.slug));
			for (const match of commentMatches.slice(0, 10)) {
				const restaurant = restaurants.find((row) => row.slug === match.slug);
				if (!restaurant || seen.has(match.slug)) continue;
				seen.add(match.slug);
				list.push({ kind: 'restaurant', restaurant, id: `search-option-${match.slug}`, quote: match.quote });
			}
		}
		return list;
	});

	let showNoResults = $derived(
		Boolean(showDropdown && fuseRequested && queryTrimmed && options.length === 0 && commentSearchStatus !== 'loading' && commentSearchStatus !== 'error')
	);
	let showResultsDropdown = $derived(showDropdown && options.length > 0);

	let isFocused = $state(false);
	let shortcutLabel = $state(
		typeof navigator !== 'undefined' &&
			/Mac|iPhone|iPad|iPod/i.test(
				(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
					?.platform ?? navigator.platform
			)
			? '⌘K'
			: 'Ctrl+K'
	);

	const SEARCH_PLACEHOLDER_FULL = 'Search restaurants, cuisines, or cities...';
	const SEARCH_PLACEHOLDER_NARROW = 'Search restaurants or cities...';
	const NARROW_SEARCH_MQ = '(max-width: 369px)';

	let narrowSearch = $state(false);
	let searchPlaceholder = $derived(
		narrowSearch ? SEARCH_PLACEHOLDER_NARROW : SEARCH_PLACEHOLDER_FULL
	);

	$effect(() => {
		const mq = window.matchMedia(NARROW_SEARCH_MQ);
		const sync = () => {
			narrowSearch = mq.matches;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	function filterOptionLabel(match: FilterMatch): string {
		return match.type === 'city'
			? `Filter by city: ${match.value}`
			: `Filter by cuisine: ${match.value}`;
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		const isEditable = target && (
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA' ||
			target.isContentEditable
		);

		if (isEditable) return;

		if (e.key === '/' || ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K'))) {
			e.preventDefault();
			inputEl?.focus();
			ensureFuse();
			showDropdown = true;
		}
	}

	function selectResult(restaurant: Restaurant) {
		appState.searchQuery = restaurant.name;
		showDropdown = false;
		highlightIndex = -1;
		appState.selectedRestaurantSlug = restaurant.slug;
		appState.listScrollTarget = restaurant.slug;
		if (restaurant.lat && restaurant.lng) {
			appState.mapTarget = { slug: restaurant.slug, lat: restaurant.lat, lng: restaurant.lng };
		}
	}

	function applyFilterMatch(match: FilterMatch) {
		if (match.type === 'cuisine') {
			if (!appState.activeCuisines.includes(match.value)) {
				appState.activeCuisines = [...appState.activeCuisines, match.value];
			}
		} else {
			if (!appState.activeCities.includes(match.value)) {
				appState.activeCities = [...appState.activeCities, match.value];
			}
		}
		showDropdown = false;
		highlightIndex = -1;
	}

	function activateOption(index: number) {
		const option = options[index];
		if (!option) return;
		if (option.kind === 'filter') {
			trackEvent('filter_applied', { kind: 'search_suggestion' });
			applyFilterMatch(option.match);
			return;
		}
		trackEvent('search_submitted', { zero_results: false });
		selectResult(option.restaurant);
	}

	function applyFilterFromSearch() {
		// Enter must act on the query as typed, not the debounced copy.
		debouncedQuery = appState.searchQuery;
		if (!queryTrimmed) return;
		if (options.length === 0) trackEvent('search_submitted', { zero_results: true });

		// The visibly highlighted row wins; with nothing highlighted, the first row does.
		const index = highlightIndex >= 0 ? highlightIndex : 0;
		activateOption(Math.min(index, options.length - 1));
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			applyFilterFromSearch();
			return;
		}

		if (!showDropdown || options.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightIndex = Math.min(highlightIndex + 1, options.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightIndex = Math.max(highlightIndex - 1, 0);
		} else if (e.key === 'Escape') {
			showDropdown = false;
			highlightIndex = -1;
		}
	}

	function handleInput() {
		ensureFuse();
		showDropdown = true;
		highlightIndex = 0;
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="search-container">
	<div class="search-wrapper">
		<span class="search-icon" aria-hidden="true"><Search size={18} /></span>
		<input
			bind:this={inputEl}
			type="search"
			inputmode="search"
			enterkeyhint="search"
			autocapitalize="none"
			autocorrect="off"
			autocomplete="off"
			spellcheck="false"
			placeholder={searchPlaceholder}
			bind:value={appState.searchQuery}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={() => { ensureFuse(); showDropdown = true; isFocused = true; }}
			onblur={() => { isFocused = false; setTimeout(() => (showDropdown = false), 200); }}
			role="combobox"
			aria-expanded={showResultsDropdown || showNoResults}
			aria-controls="search-listbox"
			aria-activedescendant={highlightIndex >= 0 ? options[highlightIndex]?.id : undefined}
			aria-autocomplete="list"
			aria-label="Search restaurants, cuisines, or cities"
		/>
		{#if appState.searchQuery}
			<button
				class="clear-btn"
				aria-label="Clear search"
				onclick={() => {
					appState.searchQuery = '';
					showDropdown = false;
					inputEl?.focus();
				}}
			>
				<X size={18} aria-hidden="true" />
			</button>
		{:else if !isFocused}
			<kbd class="search-shortcut" aria-label="Keyboard shortcut {shortcutLabel} or /">{shortcutLabel}</kbd>
		{/if}

		{#if showResultsDropdown}
			<ul class="dropdown" id="search-listbox" role="listbox" aria-label="Search results">
				{#each options as option, i (option.id)}
					{#if option.kind === 'filter'}
						<li
							id={option.id}
							class="filter-option"
							class:highlighted={i === highlightIndex}
							onmousedown={() => activateOption(i)}
							onmouseenter={() => (highlightIndex = i)}
							role="option"
							aria-selected={i === highlightIndex}
						>
							<span class="filter-label">{filterOptionLabel(option.match)}</span>
							<span
								class="filter-chip"
								class:city-chip={option.match.type === 'city'}
								class:cuisine-chip={option.match.type === 'cuisine'}
								aria-hidden="true"
							>
								{option.match.value}
							</span>
						</li>
					{:else}
						<li
							id={option.id}
							class:comment-option={option.quote !== undefined}
							class:highlighted={i === highlightIndex}
							onmousedown={() => activateOption(i)}
							onmouseenter={() => (highlightIndex = i)}
							role="option"
							aria-selected={i === highlightIndex}
						>
							<span class="result-name">{option.restaurant.name}</span>
							{#if option.quote !== undefined}
								<span class="comment-label">Mentioned in comments</span>
								<span class="comment-quote">“{option.quote}”</span>
							{/if}
							<span class="result-meta">
								{#if option.restaurant.cuisine}
									<span class="result-cuisine">{option.restaurant.cuisine}</span>
								{/if}
								{#if option.restaurant.location}
									<span class="result-location">{option.restaurant.location}</span>
								{/if}
							</span>
						</li>
					{/if}
				{/each}
			</ul>
		{:else if showNoResults}
			<div class="dropdown no-results" id="search-listbox" role="status" aria-live="polite">
				No matches for &ldquo;{queryTrimmed}&rdquo;
			</div>
		{/if}
	</div>
	{#if appState.searchQuery.trim() && commentSearchStatus === 'loading'}
		<p class="comment-status" role="status">Searching comments…</p>
	{:else if appState.searchQuery.trim() && commentSearchStatus === 'error'}
		<p class="comment-status" role="status">Comment search unavailable; name matches still work.</p>
	{:else if commentSearchStatus === 'ready' && commentLimitReached}
		<p class="comment-status" role="status">Comment search reached its 100-match limit. Refine your query.</p>
	{/if}
</div>

<style>
	.comment-status {
		margin: 0.35rem auto 0;
		max-width: 640px;
		font-size: 0.75rem;
		color: #7a6e63;
	}

	li.comment-option {
		flex-wrap: wrap;
	}

	.comment-label {
		font-size: 0.7rem;
		color: #7a6e63;
	}

	.comment-quote {
		flex-basis: 100%;
		font-size: 0.8rem;
		font-weight: 400;
		color: #7a6e63;
		overflow-wrap: anywhere;
	}
	.search-container {
		position: relative;
		z-index: 1100;
		background: transparent;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(232, 224, 214, 0.5);
	}

	.search-wrapper {
		position: relative;
		max-width: 640px;
		margin: 0 auto;
	}

	.search-icon {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		width: 18px;
		height: 18px;
		color: #7a6e63;
		pointer-events: none;
	}

	input {
		width: 100%;
		padding: 0.65rem 2.5rem 0.65rem 2.5rem;
		border: 1.5px solid #e0d6cc;
		border-radius: 10px;
		font-size: 0.95rem;
		font-family: 'DM Sans', sans-serif;
		outline: none;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
		box-sizing: border-box;
		background: #fff;
		color: #3e2c23;
	}

	input::placeholder {
		color: #7a6e63;
		text-overflow: ellipsis;
	}

	input[type='search']::-webkit-search-cancel-button {
		display: none;
	}

	/* Hover cue — kept before :focus so the focus state wins per-property */
	input:hover {
		border-color: #d8a48f;
	}

	input:focus {
		border-color: #ff4500;
		box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.08);
	}

	.clear-btn {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: #7a6e63;
		cursor: pointer;
		padding: 6px;
		line-height: 1;
		border-radius: 6px;
		transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
	}

	.clear-btn:hover {
		color: #c43700;
		background: #fff0eb;
	}

	.clear-btn:active {
		color: #c43700;
		background: #fff0eb;
		transform: translateY(-50%) scale(0.97);
	}

	.search-shortcut {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 0.72rem;
		font-weight: 500;
		color: #6b5d52;
		background: #f4ede4;
		border: 1px solid #e0d6cc;
		border-radius: 4px;
		padding: 1px 6px;
		pointer-events: none;
		line-height: 1.4;
	}

	.dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin: 4px 0 0;
		background: #fffcf8;
		border: 1px solid #e0d6cc;
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(62, 44, 35, 0.1);
		list-style: none;
		padding: 4px 0;
		max-height: 360px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	li {
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		transition: background 0.15s ease;
	}

	/* Pointer hover is independent of keyboard .highlighted so they don't fight. */
	li:hover {
		background: #faf7f2;
	}

	li.highlighted,
	li.highlighted:hover {
		background: #fff0eb;
	}

	.filter-option {
		border-bottom: 1px solid #ebe6df;
	}

	.filter-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'DM Sans', sans-serif;
		font-size: 0.875rem;
		font-weight: 500;
		color: #3e2c23;
	}

	.filter-chip {
		flex-shrink: 0;
		padding: 1px 8px;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.cuisine-chip {
		background: #f0ebe3;
		color: #5d4e37;
	}

	.city-chip {
		background: #fce8e0;
		color: #a04430;
	}

	.result-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'DM Serif Display', Georgia, serif;
		font-weight: 400;
		font-size: 0.95rem;
		color: #3e2c23;
	}

	.result-meta {
		flex-shrink: 0;
		display: flex;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: #7a6e63;
	}

	.result-cuisine {
		background: #f0ebe3;
		color: #5d4e37;
		padding: 1px 6px;
		border-radius: 4px;
	}

	.no-results {
		padding: 0.75rem 1rem;
		font-size: 0.85rem;
		color: #7a6e63;
		text-align: center;
		list-style: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.clear-btn {
			transition: color 0.15s ease, background 0.15s ease;
		}

		.clear-btn:active {
			transform: translateY(-50%);
		}

		li {
			transition: none;
		}
	}

	@media (max-width: 1023px) {
		input {
			font-size: 16px;
		}

		.search-shortcut {
			display: none;
		}

		.search-wrapper:not(:has(.clear-btn)) input {
			padding-right: 0.75rem;
		}

		.search-wrapper:has(.clear-btn) input {
			padding-right: 44px;
		}

		.clear-btn {
			width: 44px;
			height: 44px;
			padding: 0;
			right: 0;
			box-sizing: border-box;
		}

		li {
			min-height: 44px;
			padding-top: 0;
			padding-bottom: 0;
		}
	}

	@media (hover: none) and (pointer: coarse) {
		.search-shortcut {
			display: none;
		}

		.search-wrapper:not(:has(.clear-btn)) input {
			padding-right: 0.75rem;
		}
	}
</style>
