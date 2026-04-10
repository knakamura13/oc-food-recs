<script lang="ts">
	import type { Restaurant } from '$lib/types';
	import { appState, normalizeCuisine, normalizeCity } from '$lib/stores.svelte';

	interface Props {
		restaurants: Restaurant[];
	}

	let { restaurants }: Props = $props();

	let showCuisineDropdown = $state(false);
	let showCityDropdown = $state(false);

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

	export function getCuisineNames() {
		return cuisineCounts.map((c) => c.name);
	}

	export function getCityNames() {
		return cityCounts.map((c) => c.name);
	}

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

	function clearAllFilters() {
		appState.activeCuisines = [];
		appState.activeCities = [];
	}

	let hasActiveFilters = $derived(
		appState.activeCuisines.length > 0 || appState.activeCities.length > 0
	);
</script>

<nav class="filter-bar" aria-label="Restaurant filters">
	<div class="filter-controls">
		<!-- Cuisine dropdown -->
		<div class="dropdown-wrapper">
			<button
				class="dropdown-trigger"
				class:has-active={appState.activeCuisines.length > 0}
				aria-expanded={showCuisineDropdown}
				aria-haspopup="listbox"
				aria-controls={showCuisineDropdown ? 'cuisine-listbox' : undefined}
				onclick={() => {
					showCuisineDropdown = !showCuisineDropdown;
					showCityDropdown = false;
				}}
			>
				Cuisine
				{#if appState.activeCuisines.length > 0}
					<span class="badge">{appState.activeCuisines.length}</span>
				{/if}
				<span class="arrow" aria-hidden="true" class:open={showCuisineDropdown}>&#9662;</span>
			</button>

			{#if showCuisineDropdown}
				<div class="dropdown-panel" id="cuisine-listbox" role="listbox" aria-label="Filter by cuisine">
					{#each cuisineCounts as { name, count }}
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
		<div class="dropdown-wrapper">
			<button
				class="dropdown-trigger"
				class:has-active={appState.activeCities.length > 0}
				aria-expanded={showCityDropdown}
				aria-haspopup="listbox"
				aria-controls={showCityDropdown ? 'city-listbox' : undefined}
				onclick={() => {
					showCityDropdown = !showCityDropdown;
					showCuisineDropdown = false;
				}}
			>
				City
				{#if appState.activeCities.length > 0}
					<span class="badge">{appState.activeCities.length}</span>
				{/if}
				<span class="arrow" aria-hidden="true" class:open={showCityDropdown}>&#9662;</span>
			</button>

			{#if showCityDropdown}
				<div class="dropdown-panel" id="city-listbox" role="listbox" aria-label="Filter by city">
					{#each cityCounts as { name, count }}
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

		{#if hasActiveFilters}
			<button class="clear-filters" onclick={clearAllFilters}>Clear all</button>
		{/if}
	</div>

	<!-- Active filter pills -->
	{#if hasActiveFilters}
		<div class="active-pills">
			{#each appState.activeCuisines as cuisine}
				<button class="pill cuisine-pill" onclick={() => toggleCuisine(cuisine)} aria-label="Remove {cuisine} filter">
					{cuisine} &times;
				</button>
			{/each}
			{#each appState.activeCities as city}
				<button class="pill city-pill" onclick={() => toggleCity(city)} aria-label="Remove {city} filter">
					{city} &times;
				</button>
			{/each}
		</div>
	{/if}
</nav>

<!-- Click-away & keyboard listeners -->
<svelte:window
	onclick={(e) => {
		const target = e.target as HTMLElement;
		if (!target.closest('.dropdown-wrapper')) {
			showCuisineDropdown = false;
			showCityDropdown = false;
		}
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			showCuisineDropdown = false;
			showCityDropdown = false;
		}
	}}
/>

<style>
	.filter-bar {
		padding: 0.5rem 1rem;
		border-bottom: 1px solid #eee;
		background: #fafafa;
	}

	.filter-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.dropdown-wrapper {
		position: relative;
	}

	.dropdown-trigger {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: #fff;
		font-size: 0.85rem;
		cursor: pointer;
		color: #555;
		font-weight: 500;
		transition: all 0.15s;
	}

	.dropdown-trigger:hover {
		border-color: #ff4500;
		color: #ff4500;
	}

	.dropdown-trigger.has-active {
		background: #fff3ed;
		border-color: #ff4500;
		color: #ff4500;
	}

	.badge {
		background: #ff4500;
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
		min-width: 220px;
		max-height: 320px;
		overflow-y: auto;
		background: #fff;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
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
		font-size: 0.84rem;
		text-align: left;
		gap: 6px;
		color: #333;
	}

	.dropdown-item:hover {
		background: #fafafa;
	}

	.dropdown-item.active {
		background: #fff3ed;
		color: #ff4500;
	}

	.item-check {
		width: 16px;
		font-size: 0.75rem;
		color: #ff4500;
		flex-shrink: 0;
	}

	.item-name {
		flex: 1;
	}

	.item-count {
		font-size: 0.75rem;
		color: #767676;
	}

	.clear-filters {
		font-size: 0.8rem;
		padding: 4px 10px;
		border: none;
		background: none;
		color: #ff4500;
		cursor: pointer;
		font-weight: 500;
	}

	.clear-filters:hover {
		text-decoration: underline;
	}

	.active-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.4rem;
		max-width: 1200px;
		margin-left: auto;
		margin-right: auto;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 0.75rem;
		cursor: pointer;
		border: none;
		font-weight: 500;
	}

	.cuisine-pill {
		background: #e8f5e9;
		color: #2e7d32;
	}

	.city-pill {
		background: #e3f2fd;
		color: #1565c0;
	}

	.pill:hover {
		opacity: 0.7;
	}
</style>
