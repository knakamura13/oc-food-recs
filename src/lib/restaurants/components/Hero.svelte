<script lang="ts">
	import type { RestaurantData } from '$lib/restaurants/types';

	interface Props {
		meta: RestaurantData['meta'];
	}

	let { meta }: Props = $props();

	let threadCount = $derived(meta.source_threads.length);
	let subredditCount = $derived(new Set(meta.source_threads.map((t) => t.subreddit)).size);
	let totalCommentsLabel = $derived(meta.total_comments_processed.toLocaleString());
	let newestLabel = $derived(
		meta.newest_comment_date
			? new Date(meta.newest_comment_date).toLocaleDateString('en-US', {
					month: 'short',
					year: 'numeric',
					timeZone: 'UTC'
				})
			: null
	);
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
		{#if newestLabel}Comments through {newestLabel}.{/if}
	</p>
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
		font-size: clamp(1.25rem, 0.7rem + 2.75vw, 1.75rem);
		font-weight: 400;
		margin: 0 0 0.5rem;
		line-height: 1.15;
		color: #3e2c23;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}

	p {
		font-size: 0.95rem;
		color: #7a6e63;
		line-height: 1.6;
		margin: 0 0 0.5rem;
	}

	/* Desktop explorer is a locked viewport — keep the intro compact so map + list
	   get the space. */
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
	}

	@media (max-width: 1023px) {
		.hero {
			padding: 0.65rem 1rem 0.35rem;
		}

		h1 {
			font-size: 1.2rem;
			margin: 0 0 0.2rem;
		}

		p {
			font-size: 0.78rem;
			line-height: 1.4;
			margin: 0 0 0.15rem;
		}

		/* Do not line-clamp .summary: 320px needs 3 lines; a 2-line clamp cuts mid-number. */
	}
</style>
