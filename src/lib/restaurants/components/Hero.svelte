<script lang="ts">
	import type { RestaurantData } from '$lib/restaurants/types';

	interface Props {
		meta: RestaurantData['meta'];
	}

	let { meta }: Props = $props();

	let threadCount = $derived(meta.source_threads.length);
	let subredditCount = $derived(new Set(meta.source_threads.map((t) => t.subreddit)).size);
	let totalCommentsLabel = $derived(meta.total_comments_processed.toLocaleString());
</script>

<section class="hero">
	<h1>Best Mom & Pop Restaurants in Orange County</h1>
	<p class="summary">
		{#if threadCount === 1}
			This interactive explorer is built from one Reddit thread and {totalCommentsLabel} community
			comments.
		{:else}
			This interactive explorer pulls together {threadCount} Reddit threads{#if subredditCount > 1}{' '}across
				{subredditCount} subreddits{/if} and {totalCommentsLabel} community comments.
		{/if}
	</p>
	<p class="attribution">Built with SvelteKit, hosted on <a href="https://railway.com?referralCode=QCz9lp" target="_blank" rel="noopener noreferrer">Railway</a></p>
</section>

<style>
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

	p {
		font-size: 0.95rem;
		color: #7a6e63;
		line-height: 1.6;
		margin: 0 0 0.5rem;
	}

	a {
		color: #ff4500;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
		font-weight: 500;
		transition: text-decoration-thickness 0.15s ease;
	}

	a:hover {
		text-decoration-thickness: 2px;
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

	.attribution a:hover {
		color: #ff4500;
	}

	/* Desktop explorer is a locked viewport — keep the intro compact so map + list
	   get the space. Short laptop windows hide the attribution line entirely. */
	@media (min-width: 1024px) {
		.hero {
			padding: 0.85rem 1.5rem 0.4rem;
		}

		h1 {
			font-size: 1.4rem;
			margin: 0 0 0.25rem;
		}

		p {
			font-size: 0.85rem;
			line-height: 1.4;
			margin: 0 0 0.2rem;
		}

		.attribution {
			margin-top: 0;
		}
	}

	@media (min-width: 1024px) and (max-height: 800px) {
		.attribution {
			display: none;
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

		p {
			font-size: 0.82rem;
			line-height: 1.45;
			margin: 0 0 0.3rem;
		}
	}
</style>
