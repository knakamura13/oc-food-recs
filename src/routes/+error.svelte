<script lang="ts">
	import { page } from '$app/state';

	const isNotFound = $derived(page.status === 404);
	const title = $derived(isNotFound ? 'Page not found' : 'Something went wrong');
	const message = $derived(
		isNotFound
			? "We couldn't find that page. Head back to the restaurant list."
			: 'The site hit a snag loading data. Try again in a moment.'
	);
</script>

<svelte:head>
	<title>{title} — OC Food Recs</title>
</svelte:head>

<main class="error-page">
	<p class="error-code">{page.status}</p>
	<h1>{title}</h1>
	<p class="error-message">{message}</p>
	<a href="/" class="home-link">Back to restaurants</a>
</main>

<style>
	.error-page {
		min-height: 100dvh;
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

	h1 {
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
