<script lang="ts">
	let expanded = $state(false);
</script>

<section class="hero">
	<h1>Best Mom & Pop Restaurants in Orange County</h1>
	<p class="summary">
		In April 2026, someone asked r/orangecounty: <em>"What's your favorite mom and pop family owned restaurant?"</em>
		— and 735 people answered.
		<span class="full-text" class:visible={expanded}>
			This site is an interactive explorer built from that thread.
			Every restaurant, upvote, and endorsement below comes directly from the community.
		</span>
		<button class="read-more" class:hidden={expanded} onclick={() => (expanded = true)} aria-expanded={expanded}>
			More&hellip;
		</button>
	</p>
	<a href="https://www.reddit.com/r/orangecounty/comments/1sb0qo7/" target="_blank" rel="noopener">
		View the original Reddit thread &rarr;
	</a>
	<p class="attribution">Built with SvelteKit, hosted on <a href="https://railway.com?referralCode=QCz9lp" target="_blank" rel="noopener">Railway</a></p>
</section>

<style>
	.hero {
		text-align: center;
		padding: 2rem 1.5rem 1rem;
		max-width: 720px;
		margin: 0 auto;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
		line-height: 1.3;
		color: #1a1a2e;
	}

	p {
		font-size: 0.95rem;
		color: #555;
		line-height: 1.6;
		margin: 0 0 0.5rem;
	}

	a {
		font-size: 0.9rem;
		color: #ff4500;
		text-decoration: none;
		font-weight: 500;
	}

	a:hover {
		text-decoration: underline;
	}

	.attribution {
		font-size: 0.75rem;
		color: #767676;
		margin-top: 0.25rem;
	}

	.attribution a {
		font-size: 0.75rem;
		color: #767676;
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
			font-size: 1.15rem;
			margin: 0 0 0.3rem;
		}

		p {
			font-size: 0.82rem;
			line-height: 1.45;
			margin: 0 0 0.3rem;
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
