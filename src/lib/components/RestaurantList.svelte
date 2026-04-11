<script lang="ts">
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { Restaurant, SortKey } from '$lib/types';
	import { appState, slugify, normalizeCuisine } from '$lib/stores.svelte';

	interface Props {
		restaurants: Restaurant[];
	}

	let { restaurants }: Props = $props();

	const sortOptions: { key: 'score' | 'name'; label: string }[] = [
		{ key: 'score', label: 'Score' },
		{ key: 'name', label: 'Name' }
	];

	function cycleSort(key: 'score' | 'name') {
		if (appState.sortKey !== key) {
			// Activate this sort with default direction
			appState.sortKey = key;
			appState.sortDirection = key === 'score' ? 'desc' : 'asc';
		} else if (
			(key === 'score' && appState.sortDirection === 'desc') ||
			(key === 'name' && appState.sortDirection === 'asc')
		) {
			// Flip direction
			appState.sortDirection = appState.sortDirection === 'desc' ? 'asc' : 'desc';
		} else {
			// Third click: disable sort
			appState.sortKey = null;
		}
	}

	let sorted = $derived.by(() => {
		const arr = [...restaurants];
		const key = appState.sortKey;
		const dir = appState.sortDirection;

		if (!key) return arr;

		arr.sort((a, b) => {
			let cmp: number;
			if (key === 'score') {
				cmp = a.aggregate_score - b.aggregate_score;
			} else {
				cmp = a.name.localeCompare(b.name);
			}
			return dir === 'desc' ? -cmp : cmp;
		});
		return arr;
	});

	$effect(() => {
		const target = appState.listScrollTarget;
		if (target) {
			const slug = slugify(target.name);
			appState.selectedRestaurantSlug = slug;
			appState.listScrollTarget = null;
			tick().then(() => {
				const el = document.getElementById(`restaurant-${slug}`);
				if (el) {
					el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
			});
		}
	});

	function toggleRow(restaurant: Restaurant) {
		const slug = slugify(restaurant.name);
		if (appState.selectedRestaurantSlug === slug) {
			appState.selectedRestaurantSlug = null;
		} else {
			appState.selectedRestaurantSlug = slug;
			if (restaurant.lat && restaurant.lng) {
				appState.mapTarget = restaurant;
			}
		}
	}

	function showOnMap(restaurant: Restaurant) {
		appState.mapTarget = restaurant;
		const mapEl = document.querySelector('.map-container');
		if (mapEl) {
			mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	function googleMapsUrl(restaurant: Restaurant): string {
		const query = restaurant.name + ' ' + (restaurant.location || 'Orange County') + ' CA';
		return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
	}

	function groupEndorsements(restaurant: Restaurant) {
		const groups = {
			dish_rec: [] as typeof restaurant.endorsements,
			personal_story: [] as typeof restaurant.endorsements,
			endorsement: [] as typeof restaurant.endorsements
		};
		for (const e of restaurant.endorsements) {
			groups[e.type]?.push(e);
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
				class:active={appState.sortKey === opt.key}
				onclick={() => cycleSort(opt.key)}
				aria-pressed={appState.sortKey === opt.key}
			>
				{opt.label}
				{#if appState.sortKey === opt.key}
					<span class="sort-arrow">{appState.sortDirection === 'desc' ? '\u25BC' : '\u25B2'}</span>
				{/if}
			</button>
		{/each}
		<span class="result-count" aria-live="polite">{restaurants.length} restaurants</span>
	</div>

	<div class="list-scroll">
		{#if sorted.length === 0}
			<div class="empty-state">
				<span class="empty-icon">&#x1F50D;</span>
				<p class="empty-title">No restaurants found</p>
				<p class="empty-hint">Try adjusting your filters or search terms</p>
			</div>
		{/if}
		{#each sorted as restaurant (restaurant.name)}
			{@const slug = slugify(restaurant.name)}
			{@const isOpen = appState.selectedRestaurantSlug === slug}
			{@const groups = groupEndorsements(restaurant)}

			<div class="row" class:expanded={isOpen} id="restaurant-{slug}">
				<button class="row-header" onclick={() => toggleRow(restaurant)} aria-expanded={isOpen} aria-controls={isOpen ? `drawer-${slug}` : undefined}>
					<div class="row-main">
						<span class="row-name">{restaurant.name}</span>
						<div class="row-tags">
							{#if restaurant.cuisine}
								<span class="tag cuisine-tag">{normalizeCuisine(restaurant.cuisine)}</span>
							{/if}
							{#if restaurant.location}
								<span class="tag location-tag">{restaurant.location}</span>
							{/if}
						</div>
					</div>
					<div class="row-stats">
						<span class="stat score">{restaurant.aggregate_score} <small>pts</small></span>
						<span class="stat">{restaurant.endorsements.length} <small>endorse</small></span>
						<span class="stat">{restaurant.mention_count} <small>mentions</small></span>
					</div>
					<span class="chevron" aria-hidden="true" class:open={isOpen}>&rsaquo;</span>
				</button>

				{#if isOpen}
					<div class="drawer" id="drawer-{slug}" role="region" aria-label="{restaurant.name} details" transition:slide={{ duration: 200 }}>
						<div class="primary-comment">
							<div class="comment-header">
								<span class="comment-author">u/{restaurant.primary_comment.author}</span>
								<span class="comment-score">
									{restaurant.primary_comment.score} points
									<span class="info-tip" tabindex="0" aria-label="Score info">
										<span class="info-icon" aria-hidden="true">i</span>
										<span class="info-tooltip" role="tooltip">Total Reddit upvotes across all comments that recommended this restaurant.</span>
									</span>
								</span>
							</div>
							<p class="comment-body">{restaurant.primary_comment.body}</p>
							<a
								href={restaurant.primary_comment.permalink}
								target="_blank"
								rel="noopener"
								class="permalink"
							>
								View on Reddit &rarr;
							</a>
						</div>

						{#if groups.dish_rec.length > 0}
							<div class="endorsement-section">
								<h3>What to Order</h3>
								{#each groups.dish_rec as e}
									<div class="endorsement-card">
										<div class="endorsement-meta">
											<span class="endorsement-author">u/{e.author}</span>
											<span class="endorsement-score">{e.score} pts</span>
										</div>
										<p>{e.body}</p>
									</div>
								{/each}
							</div>
						{/if}

						{#if groups.personal_story.length > 0}
							<div class="endorsement-section">
								<h3>Community Stories</h3>
								{#each groups.personal_story as e}
									<div class="endorsement-card">
										<div class="endorsement-meta">
											<span class="endorsement-author">u/{e.author}</span>
											<span class="endorsement-score">{e.score} pts</span>
										</div>
										<p>{e.body}</p>
									</div>
								{/each}
							</div>
						{/if}

						{#if groups.endorsement.length > 0}
							<div class="endorsement-section">
								<h3>Community Love</h3>
								{#each groups.endorsement as e}
									<div class="endorsement-card">
										<div class="endorsement-meta">
											<span class="endorsement-author">u/{e.author}</span>
											<span class="endorsement-score">{e.score} pts</span>
										</div>
										<p>{e.body}</p>
									</div>
								{/each}
							</div>
						{/if}

						<div class="drawer-actions">
							{#if restaurant.lat && restaurant.lng}
								<button class="map-link" onclick={() => showOnMap(restaurant)}>
									Show on map
								</button>
							{/if}
							<a
								class="maps-link"
								href={googleMapsUrl(restaurant)}
								target="_blank"
								rel="noopener"
								aria-label="Open {restaurant.name} in Google Maps"
							>
								<svg class="maps-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
									<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
									<circle cx="12" cy="9" r="2.5"/>
								</svg>
								Google Maps
							</a>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.restaurant-list {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.sort-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #eee;
		background: #fafafa;
		flex-shrink: 0;
	}

	.sort-label {
		font-size: 0.8rem;
		color: #767676;
	}

	.sort-btn {
		font-size: 0.8rem;
		padding: 4px 12px;
		border: 1px solid #ddd;
		border-radius: 5px;
		background: #fff;
		cursor: pointer;
		color: #555;
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
		color: #767676;
	}

	.list-scroll {
		flex: 1;
		overflow-y: auto;
	}

	.row {
		border-bottom: 1px solid #f0f0f0;
		transition: background-color 0.15s ease;
	}

	.row.expanded {
		background: #fffbf8;
	}

	.row-header {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.6rem 0.75rem;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		gap: 0.75rem;
		transition: background-color 0.15s ease;
	}

	.row-header:hover {
		background: #f8f5f2;
	}

	.row-header:active {
		background: #f0ebe6;
	}

	.row-main {
		flex: 1;
		min-width: 0;
	}

	.row-name {
		font-weight: 600;
		font-size: 0.92rem;
		color: #1a1a2e;
		display: block;
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
		background: #e8f5e9;
		color: #2e7d32;
	}

	.location-tag {
		background: #e3f2fd;
		color: #1565c0;
	}

	.row-stats {
		display: flex;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.stat {
		font-size: 0.82rem;
		color: #555;
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
		margin-left: 2px;
		vertical-align: middle;
	}

	.info-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1px solid #ccc;
		font-size: 0.6rem;
		font-weight: 700;
		font-style: italic;
		color: #767676;
		cursor: help;
		line-height: 1;
	}

	.info-tooltip {
		display: none;
		position: absolute;
		bottom: calc(100% + 6px);
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
		z-index: 100;
		pointer-events: none;
	}

	.info-tip:hover .info-tooltip,
	.info-tip:focus .info-tooltip {
		display: block;
	}

	.stat small {
		font-size: 0.7rem;
		font-weight: 400;
		color: #767676;
	}

	.chevron {
		font-size: 1.3rem;
		color: #ccc;
		transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		flex-shrink: 0;
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.row-header:hover .chevron {
		color: #ff4500;
	}

	.drawer {
		padding: 0.75rem 1rem 1rem;
		border-top: 1px solid #f0e0d0;
	}

	.primary-comment {
		background: #fff;
		border: 1px solid #eee;
		border-radius: 8px;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
	}

	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.35rem;
	}

	.comment-author {
		font-size: 0.82rem;
		font-weight: 600;
		color: #1565c0;
	}

	.comment-score {
		font-size: 0.78rem;
		color: #ff4500;
		font-weight: 600;
	}

	.comment-body {
		font-size: 0.88rem;
		line-height: 1.5;
		color: #333;
		margin: 0;
		white-space: pre-wrap;
	}

	.permalink {
		display: inline-block;
		margin-top: 0.4rem;
		font-size: 0.78rem;
		color: #ff4500;
		text-decoration: none;
	}

	.permalink:hover {
		text-decoration: underline;
	}

	.endorsement-section {
		margin-bottom: 0.75rem;
	}

	.endorsement-section h3 {
		font-size: 0.82rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin: 0 0 0.4rem;
		padding-bottom: 0.2rem;
		border-bottom: 1px solid #eee;
	}

	.endorsement-card {
		background: #fff;
		border: 1px solid #f0f0f0;
		border-radius: 4px;
		padding: 0.5rem 0.65rem;
		margin-bottom: 0.35rem;
	}

	.endorsement-meta {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.2rem;
	}

	.endorsement-author {
		font-size: 0.78rem;
		color: #1565c0;
		font-weight: 500;
	}

	.endorsement-score {
		font-size: 0.75rem;
		color: #767676;
	}

	.endorsement-card p {
		font-size: 0.85rem;
		line-height: 1.45;
		color: #444;
		margin: 0;
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
		background: #fff;
		color: #ff4500;
		transition: all 0.15s ease;
		font-weight: 500;
	}

	.map-link:hover {
		background: #ff4500;
		color: #fff;
		box-shadow: 0 2px 4px rgba(255, 69, 0, 0.2);
	}

	.map-link:active {
		transform: scale(0.97);
	}

	.maps-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8rem;
		padding: 5px 14px;
		border-radius: 6px;
		border: 1px solid #4285f4;
		background: #fff;
		color: #4285f4;
		text-decoration: none;
		transition: all 0.15s ease;
		font-weight: 500;
	}

	.maps-link:hover {
		background: #4285f4;
		color: #fff;
		box-shadow: 0 2px 4px rgba(66, 133, 244, 0.2);
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
		font-size: 1rem;
		font-weight: 600;
		color: #555;
		margin: 0 0 0.25rem;
	}

	.empty-hint {
		font-size: 0.85rem;
		color: #767676;
		margin: 0;
	}

	@media (max-width: 768px) {
		.restaurant-list {
			height: auto;
		}

		.list-scroll {
			overflow-y: visible;
		}
	}
</style>
