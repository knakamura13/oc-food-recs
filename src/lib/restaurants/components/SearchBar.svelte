<script lang="ts">
	import type { FuseResult } from 'fuse.js';
	import { Search, X } from 'lucide-svelte';
	import type { Restaurant } from '$lib/restaurants/types';
	import { appState, findFilterMatch } from '$lib/restaurants/stores.svelte';
	import {
		FUSE_SEARCH_OPTIONS,
		prepareSearchIndex,
		rankSearchResults,
		type SearchableRestaurant
	} from '$lib/restaurants/search-restaurants';

	interface Props {
		restaurants: Restaurant[];
		cuisineNames: string[];
		cityNames: string[];
	}

	type FilterMatch = { type: 'cuisine' | 'city'; value: string };
	type SearchOption =
		| { kind: 'filter'; match: FilterMatch; id: 'search-option-filter' }
		| { kind: 'restaurant'; restaurant: Restaurant; id: string };

	let { restaurants, cuisineNames, cityNames }: Props = $props();

	let inputEl: HTMLInputElement | undefined = $state();
	let showDropdown = $state(false);
	let highlightIndex = $state(-1);

	let FuseCtor = $state<typeof import('fuse.js').default | null>(null);
	async function ensureFuse() {
		if (!FuseCtor) FuseCtor = (await import('fuse.js')).default;
	}

	let fuse = $derived.by(() =>
		FuseCtor
			? new FuseCtor(prepareSearchIndex(restaurants), FUSE_SEARCH_OPTIONS)
			: null
	);

	let results = $derived.by(() => {
		const q = appState.searchQuery.trim();
		if (!fuse || !q) return [] as FuseResult<SearchableRestaurant>[];
		return rankSearchResults(fuse.search(q), q).slice(0, 10);
	});

	let queryTrimmed = $derived(appState.searchQuery.trim());

	let filterMatch = $derived.by(() =>
		queryTrimmed ? findFilterMatch(queryTrimmed, cuisineNames, cityNames) : null
	);

	let options = $derived.by((): SearchOption[] => {
		const list: SearchOption[] = [];
		if (filterMatch) {
			list.push({ kind: 'filter', match: filterMatch, id: 'search-option-filter' });
		}
		for (const result of results) {
			list.push({
				kind: 'restaurant',
				restaurant: result.item,
				id: `search-option-${result.item.slug}`
			});
		}
		return list;
	});

	let showNoResults = $derived(
		Boolean(showDropdown && FuseCtor && queryTrimmed && options.length === 0)
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
		appState.searchQuery = '';
		showDropdown = false;
		highlightIndex = -1;
	}

	function activateOption(index: number) {
		const option = options[index];
		if (!option) return;
		if (option.kind === 'filter') {
			applyFilterMatch(option.match);
			return;
		}
		selectResult(option.restaurant);
	}

	function applyFilterFromSearch() {
		const query = appState.searchQuery.trim();
		if (!query) return;

		// Highlighted row always wins — matches what the user sees selected.
		if (highlightIndex >= 0 && options.length > 0) {
			activateOption(highlightIndex);
			return;
		}

		const match = findFilterMatch(query, cuisineNames, cityNames);
		if (match) {
			applyFilterMatch(match);
			return;
		}

		// If there's exactly one result, select it
		if (results.length === 1) {
			selectResult(results[0].item);
		}
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
		highlightIndex = -1;
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
			placeholder="Search restaurants, cuisines, or cities..."
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
	</div>

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
						class:highlighted={i === highlightIndex}
						onmousedown={() => activateOption(i)}
						onmouseenter={() => (highlightIndex = i)}
						role="option"
						aria-selected={i === highlightIndex}
					>
						<span class="result-name">{option.restaurant.name}</span>
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

<style>
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
		max-width: 640px;
		margin: 4px auto 0;
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
		font-family: 'DM Serif Display', Georgia, serif;
		font-weight: 400;
		font-size: 0.95rem;
		color: #3e2c23;
	}

	.result-meta {
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
	}

	@media (hover: none) and (pointer: coarse) {
		.search-shortcut {
			display: none;
		}
	}
</style>
