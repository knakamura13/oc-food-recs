<script lang="ts">
	import ExplorerApp from '$lib/restaurants/components/ExplorerApp.svelte';
	import ExplorerSkeleton from '$lib/restaurants/components/ExplorerSkeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#await data.home}
	<ExplorerSkeleton />
{:then home}
	<ExplorerApp data={home} />
{:catch}
	<main class="load-error">
		<p class="error-code">Error</p>
		<h1>Something went wrong</h1>
		<p class="error-message">The site hit a snag loading data. Try again in a moment.</p>
		<a href="/" class="home-link">Back to restaurants</a>
	</main>
{/await}

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	:global(body) {
		margin: 0;
		font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
			Arial, sans-serif;
		color: #3e2c23;
		background: #faf7f2;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		line-height: 1.55;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(button),
	:global(a),
	:global([role='button']) {
		touch-action: manipulation;
	}

	:global(*:focus-visible) {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			scroll-behavior: auto !important;
		}
	}

	.load-error {
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 2rem 1.5rem;
		font-family: 'DM Sans', sans-serif;
		color: #3e2c23;
	}

	.error-code {
		margin: 0 0 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #ff4500;
	}

	.load-error h1 {
		margin: 0 0 0.75rem;
		font-size: 1.75rem;
		font-weight: 700;
	}

	.error-message {
		margin: 0 0 1.5rem;
		max-width: 28rem;
		color: #5d4e37;
		line-height: 1.5;
	}

	.home-link {
		display: inline-flex;
		align-items: center;
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		background: #ff4500;
		color: #fffdf9;
		font-weight: 600;
		text-decoration: none;
	}
</style>
