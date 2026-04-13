<script lang="ts">
	import Fuse from 'fuse.js';
	import type { Restaurant } from '$lib/types';
	import { appState, slugify, findFilterMatch } from '$lib/stores.svelte';

	interface Props {
		restaurants: Restaurant[];
		cuisineNames: string[];
		cityNames: string[];
	}

	let { restaurants, cuisineNames, cityNames }: Props = $props();

	let inputEl: HTMLInputElement | undefined = $state();
	let showDropdown = $state(false);
	let highlightIndex = $state(-1);

	const fuse = new Fuse(restaurants, {
		keys: ['name', 'cuisine', 'location'],
		threshold: 0.4,
		distance: 200,
		includeScore: true
	});

	let results = $derived.by(() => {
		if (!appState.searchQuery.trim()) return [];
		return fuse.search(appState.searchQuery).slice(0, 10);
	});

	function selectResult(restaurant: Restaurant) {
		appState.searchQuery = restaurant.name;
		showDropdown = false;
		highlightIndex = -1;
		appState.selectedRestaurantSlug = slugify(restaurant.name);
		appState.listScrollTarget = restaurant;
		if (restaurant.lat && restaurant.lng) {
			appState.mapTarget = restaurant;
		}
	}

	function applyFilterFromSearch() {
		const query = appState.searchQuery.trim();
		if (!query) return;

		// Try to match a filter (cuisine or city)
		const match = findFilterMatch(query, cuisineNames, cityNames);
		if (match) {
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
			return true;
		}

		// If a dropdown result is highlighted, select it
		if (highlightIndex >= 0 && results.length > 0) {
			selectResult(results[highlightIndex].item);
			return true;
		}

		// If there's exactly one result, select it
		if (results.length === 1) {
			selectResult(results[0].item);
			return true;
		}

		return false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			applyFilterFromSearch();
			return;
		}

		if (!showDropdown || results.length === 0) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightIndex = Math.min(highlightIndex + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightIndex = Math.max(highlightIndex - 1, 0);
		} else if (e.key === 'Escape') {
			showDropdown = false;
			highlightIndex = -1;
		}
	}

	function handleInput() {
		showDropdown = true;
		highlightIndex = -1;
	}
</script>

<div class="search-container">
	<div class="search-wrapper">
		<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<circle cx="11" cy="11" r="8" />
			<path d="M21 21l-4.35-4.35" />
		</svg>
		<input
			bind:this={inputEl}
			type="text"
			placeholder="Search restaurants, cuisines, or cities..."
			bind:value={appState.searchQuery}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={() => (showDropdown = true)}
			onblur={() => setTimeout(() => (showDropdown = false), 200)}
			role="combobox"
			aria-expanded={showDropdown && results.length > 0}
			aria-controls="search-listbox"
			aria-activedescendant={highlightIndex >= 0 ? `search-option-${highlightIndex}` : undefined}
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
				&times;
			</button>
		{/if}
	</div>

	{#if showDropdown && results.length > 0}
		<ul class="dropdown" id="search-listbox" role="listbox" aria-label="Search results">
			{#each results as result, i}
				<li
					id="search-option-{i}"
					class:highlighted={i === highlightIndex}
					onmousedown={() => selectResult(result.item)}
					onmouseenter={() => (highlightIndex = i)}
					role="option"
					aria-selected={i === highlightIndex}
				>
					<span class="result-name">{result.item.name}</span>
					<span class="result-meta">
						{#if result.item.cuisine}
							<span class="result-cuisine">{result.item.cuisine}</span>
						{/if}
						{#if result.item.location}
							<span class="result-location">{result.item.location}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.search-container {
		position: relative;
		z-index: 1100;
		background: #fffcf8;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #e8e0d6;
		box-shadow: 0 1px 4px rgba(62, 44, 35, 0.04);
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
		color: #b5a99a;
	}

	input:focus {
		border-color: #ff4500;
		box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.08);
	}

	.clear-btn {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		font-size: 1.3rem;
		color: #7a6e63;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
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
	}

	li {
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	li.highlighted {
		background: #fff0eb;
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
</style>
