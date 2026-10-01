<script lang="ts">
	import { percentOf } from './about-data';
	import { SCORING_PARAGRAPHS, scoringExample } from './scoring-model';
	import type { PageData } from './$types';

	const REMOVAL_EMAIL = 'knakamura13dev@gmail.com';

	let { data }: { data: PageData } = $props();

	const c = $derived(data.coverage);
	const example = scoringExample();
	const snapshotLabel = $derived(
		c.snapshotAt
			? new Date(c.snapshotAt).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
					timeZone: 'UTC'
				})
			: null
	);
	const n = (value: number) => value.toLocaleString('en-US');
</script>

<svelte:head>
	<title>About, sources and removal requests — OC Food Recs</title>
	<meta
		name="description"
		content="How OC Food Recs turns Reddit threads into a ranked list of Orange County restaurants: the method, every source thread, what it leaves out, and how to ask for a quote to be removed."
	/>
	<link rel="canonical" href="/about" />
</svelte:head>

<main class="about">
	<a class="back" href="/">← Back to the restaurant list</a>
	<h1>About OC Food Recs</h1>
	<p class="lede">
		A ranked, searchable map of the Orange County restaurants that Reddit keeps recommending,
		built from {n(c.threads)} threads in {n(c.subreddits)} subreddits.
	</p>

	<nav class="toc" aria-label="On this page">
		<a href="#how-it-works">How it works</a>
		<a href="#threads">Source threads</a>
		<a href="#coverage">What it leaves out</a>
		<a href="#attribution">Attribution, removal and privacy</a>
		<a href="#credits">Credits</a>
	</nav>

	<section id="how-it-works" aria-labelledby="how-heading">
		<h2 id="how-heading">How it works</h2>
		<ol class="steps">
			<li>
				<strong>Collect.</strong> Each source thread below is saved as a snapshot of its public
				comments.
			</li>
			<li>
				<strong>Read.</strong> A language model reads every comment and pulls out the restaurants it
				names, with a city, street and cuisine when the comment gives one.
			</li>
			<li>
				<strong>Locate.</strong> Each restaurant is geocoded to a map pin where an address can be
				found.
			</li>
			<li>
				<strong>Filter.</strong> A curated list removes chains and corporate-owned brands, and
				restaurants known to have closed.
			</li>
			<li>
				<strong>Score.</strong> Restaurants are ranked by the Reddit points behind them, as below.
			</li>
		</ol>

		<h3>The score</h3>
		{#each SCORING_PARAGRAPHS as paragraph (paragraph)}
			<p>{paragraph}</p>
		{/each}
		<div class="example" role="note" aria-label="Worked example">
			{#each example.lines as line (line)}
				<p>{line}</p>
			{/each}
		</div>
	</section>

	<section id="threads" aria-labelledby="threads-heading">
		<h2 id="threads-heading">Source threads</h2>
		<p>
			Every recommendation comes from one of these {n(c.threads)} threads, grouped by subreddit.
			Each quote on the site links back to its original comment.
		</p>
		{#each data.groups as group (group.subreddit)}
			<h3 class="subreddit">r/{group.subreddit} <span class="count">· {group.threads.length}</span></h3>
			<ul class="thread-list">
				{#each group.threads as thread (thread.id)}
					<li>
						<a href={thread.url} target="_blank" rel="noopener noreferrer">{thread.title}</a>
						<span class="count">{n(thread.commentCount)} comments</span>
					</li>
				{/each}
			</ul>
		{/each}
	</section>

	<section id="coverage" aria-labelledby="coverage-heading">
		<h2 id="coverage-heading">What it leaves out</h2>
		<p>
			The data covers {n(c.restaurants)} restaurants, drawn from {n(c.quotes)} quotes by
			{n(c.redditors)} Reddit users, out of {n(c.commentsRead)} comments read. It is a snapshot of
			what a few threads said, not a survey of Orange County.
		</p>
		<ul class="limits">
			{#if snapshotLabel}
				<li>
					<strong>Snapshot of {snapshotLabel}.</strong> Threads are not re-read automatically, so
					newer comments, new openings and recent closures are missing.
				</li>
			{/if}
			<li>
				<strong>{percentOf(c.withoutCoordinates, c.restaurants)}% have no map pin</strong>
				({n(c.withoutCoordinates)} restaurants). The comments did not give enough to find an address.
				They are left out of the list by default; switch on “Unmapped” to include them.
			</li>
			<li>
				<strong>{percentOf(c.withoutCuisine, c.restaurants)}% have no cuisine</strong>
				({n(c.withoutCuisine)} restaurants). They appear under “Uncategorized”.
			</li>
			<li>
				<strong>Chains are left out.</strong>
				{n(c.chainsExcluded)} chains and corporate-owned brands, plus {n(c.closedExcluded)} closed
				restaurants, were removed from the list. The “Mom &amp; pop” filter additionally hides
				places that look like chains but have not been confirmed.
			</li>
			<li>
				<strong>Extraction is automatic.</strong> A model can misread a name or merge two
				restaurants. Use “Report a chain” on a card, or write to the address below, to flag a
				mistake.
			</li>
		</ul>
	</section>

	<section id="attribution" aria-labelledby="attribution-heading">
		<h2 id="attribution-heading">Attribution, removal and privacy</h2>
		<p>
			Every recommendation is a real Reddit comment; each quote links to its original. This site is
			not affiliated with, endorsed by, or sponsored by Reddit, Inc.
		</p>

		<h3>Ask for a quote to be removed</h3>
		<p>
			If you wrote a comment shown here and want it gone, email
			<a href="mailto:{REMOVAL_EMAIL}?subject=OC%20Food%20Recs%20removal%20request">{REMOVAL_EMAIL}</a>
			with the permalink of the comment. The quote comes down within 7 days. Nothing else is needed:
			no account and no reason.
		</p>

		<h3>What we count</h3>
		<p>
			To learn which features are used, the site counts seven interactions: a search submitted
			(and whether it found anything), a filter applied (which kind), a restaurant card expanded,
			the map opened, a restaurant saved, a share link copied (from the toolbar or from a card), and
			a Google Maps link clicked. Each is stored as the event name, the time, and at most one of the
			fixed labels above.
		</p>
		<p>
			Nothing identifies a visitor. There are no cookies, no accounts and no third-party scripts.
			We do not store IP addresses, browser details or any visitor ID, and never what you typed or
			which restaurant you looked at. Your saved list stays in your own browser.
		</p>
	</section>

	<section id="credits" aria-labelledby="credits-heading">
		<h2 id="credits-heading">Credits</h2>
		<ul class="credits">
			<li>
				Map tiles and data ©
				<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
					>OpenStreetMap contributors</a
				>, shown with <a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>.
			</li>
			<li>
				Built with <a href="https://svelte.dev" target="_blank" rel="noopener noreferrer">SvelteKit</a>,
				hosted on
				<a href="https://railway.com?referralCode=QCz9lp" target="_blank" rel="noopener noreferrer"
					>Railway</a
				>.
			</li>
		</ul>
	</section>
</main>

<style>
	.about {
		max-width: 46rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		font-family: 'DM Sans', system-ui, sans-serif;
		color: #3e2c23;
		line-height: 1.6;
	}

	.back {
		display: inline-block;
		margin-bottom: 1rem;
		font-size: 0.88rem;
	}

	h1,
	h2 {
		font-family: 'DM Serif Display', Georgia, serif;
		font-weight: 400;
		line-height: 1.15;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}

	h1 {
		font-size: clamp(1.7rem, 1.2rem + 2vw, 2.3rem);
		margin: 0 0 0.5rem;
	}

	h2 {
		font-size: 1.45rem;
		margin: 0 0 0.6rem;
	}

	h3 {
		font-size: 1rem;
		margin: 1.4rem 0 0.35rem;
	}

	section {
		margin-top: 2.5rem;
		scroll-margin-top: 1rem;
	}

	p {
		margin: 0 0 0.75rem;
	}

	.lede {
		font-size: 1.05rem;
		color: #5d4e37;
	}

	a {
		color: #c43700;
		text-underline-offset: 2px;
		font-weight: 500;
	}

	a:active {
		background: #fff0eb;
	}

	.toc {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.1rem;
		margin: 1.25rem 0 0;
		padding: 0.75rem 0;
		border-block: 1px solid #e2d9ce;
		font-size: 0.9rem;
	}

	.steps {
		padding-left: 1.25rem;
		margin: 0 0 0.5rem;
	}

	.steps li {
		margin-bottom: 0.4rem;
	}

	.example {
		background: #fffdf9;
		border: 1px solid #e2d9ce;
		border-left: 3px solid #ff4500;
		border-radius: 8px;
		padding: 0.75rem 1rem 0.25rem;
		font-variant-numeric: tabular-nums;
	}

	.subreddit {
		margin-top: 1.5rem;
	}

	.count {
		font-size: 0.82rem;
		font-weight: 400;
		color: #7a6e63;
	}

	.thread-list,
	.limits,
	.credits {
		margin: 0 0 0.5rem;
		padding-left: 1.25rem;
	}

	.thread-list li,
	.limits li,
	.credits li {
		margin-bottom: 0.4rem;
	}

	@media (max-width: 640px) {
		.about {
			padding: 1rem 1rem 2.5rem;
		}

		section {
			margin-top: 2rem;
		}
	}
</style>
