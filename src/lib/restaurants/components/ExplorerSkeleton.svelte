<script lang="ts">
	import { DEFAULT_TITLE } from '$lib/restaurants/page-meta';

	const ROW_KEYS = [0, 1, 2, 3, 4, 5, 6, 7];

	const reduceMotion = () =>
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<svelte:head>
	<title>{DEFAULT_TITLE}</title>
	<meta name="theme-color" content="#ff4500" />
</svelte:head>

<main
	class="explorer-skeleton"
	class:no-motion={reduceMotion()}
	aria-busy="true"
	aria-live="polite"
>
	<span class="skeleton-status">Loading restaurants…</span>

	<section class="hero-section">
		<section class="hero">
			<h1>Best Mom &amp; Pop Restaurants in Orange County</h1>
			<p class="summary" aria-hidden="true">
				<span class="skeleton-line body medium"></span>
			</p>
			<p class="attribution">
				Built with SvelteKit, hosted on
				<a href="https://railway.com?referralCode=QCz9lp" target="_blank" rel="noopener noreferrer"
					>Railway</a
				>
			</p>
		</section>
	</section>

	<div class="app-trap">
		<div class="controls-bar">
			<div class="search-container">
				<div class="search-wrapper">
					<span class="search-icon" aria-hidden="true"></span>
					<div class="search-field">Search restaurants, cuisines, or cities...</div>
				</div>
			</div>
			<nav class="filter-bar" aria-hidden="true">
				<div class="filter-controls">
					<span class="dropdown-trigger">Cuisine</span>
					<span class="dropdown-trigger">City</span>
					<span class="dropdown-trigger">Recency</span>
					<span class="dropdown-trigger mobile-map-trigger">Map</span>
					<span class="dropdown-trigger">Share</span>
				</div>
			</nav>
		</div>
		<div class="content-area">
			<div class="map-pane" id="restaurant-map-panel" aria-hidden="true">
				<div class="map-placeholder"></div>
			</div>
			<div class="list-pane">
				<div class="restaurant-list">
					<div class="sort-bar">
						<span class="sort-label">Sort by:</span>
						<span class="sort-btn">Score</span>
						<span class="sort-btn">Recent</span>
						<span class="sort-btn">Name</span>
						<span class="result-count" aria-hidden="true">
							<span class="skeleton-line short"></span>
						</span>
					</div>
					<div class="list-scroll" id="main-content" tabindex="-1" role="region" aria-label="Restaurant results">
						{#each ROW_KEYS as row (row)}
							<div class="row">
								<div class="row-header">
									<div class="row-main">
										<span class="skeleton-line heading"></span>
										<div class="row-tags">
											<span class="skeleton-line tag"></span>
											<span class="skeleton-line tag wide"></span>
										</div>
										<span class="skeleton-line body medium"></span>
									</div>
									<div class="row-stats" aria-hidden="true">
										<span class="skeleton-line score"></span>
										<span class="skeleton-line score"></span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</main>

<style>
	.explorer-skeleton {
		font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
			Arial, sans-serif;
		color: #3e2c23;
		background: #faf7f2;
		-webkit-font-smoothing: antialiased;
		min-height: 100dvh;
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

	.hero {
		text-align: center;
		padding: 2rem 1.5rem 1rem;
		max-width: 720px;
		margin: 0 auto;
	}

	h1 {
		font-family: 'DM Serif Display', Georgia, serif;
		font-size: 1.75rem;
		font-weight: 400;
		margin: 0 0 0.5rem;
		line-height: 1.15;
		color: #3e2c23;
		letter-spacing: -0.01em;
	}

	.summary {
		font-size: 0.95rem;
		color: #7a6e63;
		line-height: 1.6;
		margin: 0 0 0.5rem;
		display: flex;
		justify-content: center;
	}

	.attribution {
		font-size: 0.75rem;
		color: #7a6e63;
		margin-top: 0.25rem;
	}

	.attribution a {
		font-size: 0.75rem;
		color: #7a6e63;
		text-decoration: underline;
	}

	.app-trap {
		position: sticky;
		top: 0;
		padding-top: env(safe-area-inset-top, 0px);
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: rgba(255, 255, 255, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		z-index: 1100;
		box-shadow: 0 4px 24px -8px rgba(62, 44, 35, 0.1);
	}

	.controls-bar {
		flex-shrink: 0;
		position: relative;
		z-index: 1200;
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
		border-radius: 50%;
		background: #efe8e0;
	}

	.search-field {
		width: 100%;
		padding: 0.65rem 2.5rem 0.65rem 2.5rem;
		border: 1.5px solid #e0d6cc;
		border-radius: 10px;
		font-size: 0.95rem;
		font-family: 'DM Sans', sans-serif;
		box-sizing: border-box;
		background: #fff;
		color: #b5a99a;
	}

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

	.dropdown-trigger {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border: 1px solid #d4c8bb;
		border-radius: 6px;
		background: #fffcf8;
		font-size: 0.85rem;
		color: #5d4e37;
		font-weight: 500;
	}

	.mobile-map-trigger {
		display: none;
	}

	.content-area {
		flex: 1;
		display: flex;
		min-height: 0;
		position: relative;
		isolation: isolate;
		overflow: hidden;
	}

	.list-pane {
		container-type: inline-size;
		container-name: list-pane;
	}

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
		color: #5d4e37;
		font-weight: 500;
	}

	.result-count {
		margin-left: auto;
		width: 7rem;
	}

	.list-scroll {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.row {
		border-bottom: 1px solid #efe8e0;
		border-left: 3px solid transparent;
		background: #fff;
	}

	.row-header {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.6rem 0.75rem;
		gap: 0.75rem;
	}

	.row-main {
		flex: 1;
		min-width: 0;
	}

	.row-tags {
		display: flex;
		gap: 0.35rem;
		margin: 0.35rem 0;
		flex-wrap: wrap;
	}

	.row-stats {
		display: flex;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.map-placeholder {
		flex: 1;
		min-height: 0;
		background: #f0ebe3;
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
		width: 3.25rem;
		height: 1.15rem;
		border-radius: 12px;
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
		width: 42%;
		height: 1rem;
		margin-bottom: 0;
	}

	.skeleton-line.tag {
		width: 4.5rem;
		height: 1rem;
		border-radius: 4px;
		margin-bottom: 0;
	}

	.skeleton-line.tag.wide {
		width: 5.5rem;
	}

	.explorer-skeleton.no-motion .skeleton-line {
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

	@media (prefers-reduced-motion: reduce) {
		.skeleton-line {
			animation: none;
			background: #efe8e0;
		}
	}

	@media (min-width: 1024px) {
		:global(html) {
			height: 100%;
			overflow: hidden;
		}

		:global(body) {
			height: 100%;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		.explorer-skeleton {
			flex: 1;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}

		.hero-section {
			flex-shrink: 0;
		}

		.hero {
			padding: 0.85rem 1.5rem 0.4rem;
		}

		h1 {
			font-size: 1.4rem;
			margin: 0 0 0.25rem;
		}

		.summary {
			font-size: 0.85rem;
			line-height: 1.4;
			margin: 0 0 0.2rem;
		}

		.attribution {
			margin-top: 0;
		}

		.app-trap {
			position: relative;
			top: auto;
			height: auto;
			min-height: 0;
			flex: 1;
			overflow: hidden;
		}

		.content-area {
			align-items: stretch;
		}

		.map-pane {
			flex-basis: 25%;
			flex-shrink: 0;
			display: flex;
			flex-direction: column;
			position: relative;
			overflow: hidden;
			height: 100%;
			min-height: 0;
			min-width: 0;
		}

		.list-pane {
			flex: 1;
			height: 100%;
			min-width: 0;
			position: relative;
			z-index: 2;
			margin-left: -48px;
			box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
			overflow: hidden;
			background: #fff;
			border-radius: 12px 0 0 0;
		}
	}

	@media (min-width: 1024px) and (max-height: 800px) {
		.attribution {
			display: none;
		}
	}

	@media (max-width: 1023px) {
		.map-pane {
			display: none;
		}

		.mobile-map-trigger {
			display: inline-flex;
		}

		.list-pane {
			width: 100%;
			display: flex;
			flex-direction: column;
			min-height: 0;
		}
	}

	@media (max-width: 768px) {
		.hero {
			padding: 1rem 1rem 0.5rem;
		}

		h1 {
			font-size: 1.25rem;
			margin: 0 0 0.3rem;
		}
	}
</style>
