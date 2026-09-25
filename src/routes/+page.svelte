<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ExplorerApp from '$lib/restaurants/components/ExplorerApp.svelte';
	import ExplorerSkeleton from '$lib/restaurants/components/ExplorerSkeleton.svelte';
	import type { PageMeta } from '$lib/restaurants/page-meta';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let clientPageMeta = $state<PageMeta | null>(null);
	const activePageMeta = $derived(clientPageMeta ?? data.pageMeta);
	const ogImageUrl = $derived(`${data.pageOrigin}/screenshot.jpeg`);

	$effect(() => {
		if (data.pageMeta) clientPageMeta = null;
	});

	function handlePageMetaChange(pageMeta: PageMeta) {
		clientPageMeta = pageMeta;
	}

	// afterNavigate must live on this page (always in the first hydrate tree).
	// Kit registers the callback in onMount and only invokes callbacks that were
	// already registered when the initial `'enter'` navigation fires — it does
	// not replay `'enter'` for ExplorerApp, which mounts later behind {#await}.
	let routerReady = $state(false);
	afterNavigate(() => {
		routerReady = true;
	});
</script>

<svelte:head>
	<title>{activePageMeta.title}</title>
	<meta name="description" content={activePageMeta.description} />
	<meta property="og:title" content={activePageMeta.title} />
	<meta property="og:description" content={activePageMeta.description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={activePageMeta.shareUrl} />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Screenshot of the OC Food Recs explorer showing a cream restaurant list beside an Orange County map" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={activePageMeta.title} />
	<meta name="twitter:description" content={activePageMeta.description} />
	<meta name="twitter:image" content={ogImageUrl} />
	<meta name="twitter:image:alt" content="Screenshot of the OC Food Recs explorer showing a cream restaurant list beside an Orange County map" />
	<link rel="canonical" href={activePageMeta.shareUrl} />
	<link rel="dns-prefetch" href="https://a.tile.openstreetmap.org" />
	<link rel="dns-prefetch" href="https://b.tile.openstreetmap.org" />
	<link rel="dns-prefetch" href="https://c.tile.openstreetmap.org" />
</svelte:head>

{#await data.home}
	<ExplorerSkeleton />
{:then home}
	<ExplorerApp
		data={home}
		initialPageMeta={data.pageMeta}
		onPageMetaChange={handlePageMetaChange}
		{routerReady}
	/>
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
