<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ExplorerApp from '$lib/restaurants/components/ExplorerApp.svelte';
	import ExplorerSkeleton from '$lib/restaurants/components/ExplorerSkeleton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// afterNavigate must live on this page (always in the first hydrate tree).
	// Kit registers the callback in onMount and only invokes callbacks that were
	// already registered when the initial `'enter'` navigation fires — it does
	// not replay `'enter'` for ExplorerApp, which mounts later behind {#await}.
	let routerReady = $state(false);
	afterNavigate(() => {
		routerReady = true;
	});
</script>

{#await data.home}
	<ExplorerSkeleton />
{:then home}
	<ExplorerApp data={home} {routerReady} />
{:catch}
	<main class="load-error">
		<p class="error-code">Error</p>
		<h1>Something went wrong</h1>
		<p class="error-message">The site hit a snag loading data. Try again in a moment.</p>
		<a href="/" class="home-link">Back to restaurants</a>
	</main>
{/await}

<style>
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
		color: #c43700;
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
		background: #c43700;
		color: #fffdf9;
		font-weight: 600;
		text-decoration: none;
		transition: background 0.15s ease, transform 0.15s ease;
	}

	.home-link:hover {
		background: #a82f00;
	}

	.home-link:active {
		background: #a82f00;
		transform: scale(0.97);
	}

	@media (prefers-reduced-motion: reduce) {
		.home-link {
			transition: background 0.15s ease;
		}

		.home-link:active {
			transform: none;
		}
	}
</style>
