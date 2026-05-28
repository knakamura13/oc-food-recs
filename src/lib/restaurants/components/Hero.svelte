<script lang="ts">
	import type { RestaurantData } from '$lib/restaurants/types';

	interface Props {
		meta: RestaurantData['meta'];
	}

	let { meta }: Props = $props();
	let expanded = $state(false);

	let threadCount = $derived(meta.source_threads.length);
	let totalCommentsLabel = $derived(meta.total_comments_processed.toLocaleString());
</script>

<section class="hero">
	<h1>Best Mom & Pop Restaurants in Orange County</h1>
	<p class="summary">
		{#if threadCount === 1}
			This interactive explorer is built from one Reddit thread and {totalCommentsLabel} community comments.
		{:else}
			This interactive explorer pulls together {threadCount} Reddit threads and {totalCommentsLabel} community comments.
		{/if}
		<span class="full-text" class:visible={expanded}>
			Every restaurant, upvote, and endorsement below comes directly from r/orangecounty.
		</span>
		<button class="read-more" class:hidden={expanded} onclick={() => (expanded = true)} aria-expanded={expanded}>
			More&hellip;
		</button>
	</p>
	<div class="sources">
		<p class="sources-label">
			{#if threadCount === 1}
				Source thread
			{:else}
				Source Reddit threads
			{/if}
		</p>
		<div class="source-list">
			{#each meta.source_threads as thread}
				<a href={thread.url} target="_blank" rel="noopener noreferrer">
					{thread.title}
				</a>
			{/each}
		</div>
	</div>
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

	.sources {
		margin: 0.5rem 0 0;
	}

	.sources-label {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #9a8f84;
		margin-bottom: 0.35rem;
	}

	.source-list {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem 0.75rem;
	}

	a {
		font-size: 0.9rem;
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

	.full-text {
		display: inline;
	}

	.read-more {
		display: none;
	}

	.read-more.hidden {
		display: none;
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

		.source-list {
			flex-direction: column;
			align-items: center;
			gap: 0.2rem;
		}

		a {
			font-size: 0.8rem;
		}

		.full-text {
			display: none;
		}

		.full-text.visible {
			display: inline;
		}

		.read-more {
			display: inline;
			background: none;
			border: none;
			color: #ff4500;
			font-size: 0.82rem;
			cursor: pointer;
			padding: 0;
			font-weight: 500;
		}

		.read-more.hidden {
			display: none;
		}
	}
</style>
