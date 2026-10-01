<script lang="ts">
	import { enhance } from '$app/forms';
	import type { TakedownComment } from '$lib/server/restaurants/admin';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { q, results, takenDown } = $derived(data);

	// Keep the search in the URL across an action so the row you just changed stays on screen.
	const actionPrefix = $derived(q ? `?${new URLSearchParams({ q })}&` : '?');

	function snippet(body: string): string {
		const text = body.replace(/\s+/g, ' ').trim();
		return text.length > 280 ? `${text.slice(0, 280)}…` : text;
	}

	function stateLabel(c: TakedownComment): string {
		if (c.publishedRows === 0) return 'Taken down';
		return c.takenDownRows === 0 ? 'Live' : 'Partly live';
	}
</script>

<svelte:head>
	<title>Takedowns</title>
</svelte:head>

{#snippet commentRow(c: TakedownComment)}
	<tr>
		<td class="quote-cell">
			<p class="quote">{snippet(c.body)}</p>
			<p class="meta">
				u/{c.author} · {c.score} points ·
				{#if c.permalink}
					<a href={c.permalink} target="_blank" rel="noopener noreferrer">permalink</a>
				{:else}
					no permalink
				{/if}
			</p>
		</td>
		<td>{c.restaurants.join(', ')}</td>
		<td>{stateLabel(c)}</td>
		<td class="actions-cell">
			{#if c.publishedRows > 0}
				<form method="POST" action="{actionPrefix}/takeDown" use:enhance class="action-form">
					<input type="hidden" name="threadId" value={c.threadId} />
					<input type="hidden" name="commentId" value={c.commentId} />
					<button type="submit">Take down</button>
				</form>
			{/if}
			{#if c.takenDownRows > 0}
				<form method="POST" action="{actionPrefix}/restore" use:enhance class="action-form">
					<input type="hidden" name="threadId" value={c.threadId} />
					<input type="hidden" name="commentId" value={c.commentId} />
					<button type="submit" class="btn-secondary">Restore</button>
				</form>
			{/if}
		</td>
	</tr>
{/snippet}

<main>
	<header>
		<h1>Takedowns</h1>
		<p class="subtitle">
			Honour a removal request from <a href="/about#attribution">/about</a>: paste the comment's
			permalink (or any words from the quote), then take it down. The quote disappears from the
			list, the drawer and the restaurant's score, for every restaurant that comment names. Restore
			puts it back. Re-ingesting a thread never undoes a takedown.
		</p>
	</header>

	<div class="queue-summary" role="status">
		<span><strong>{takenDown.length}</strong> taken down</span>
	</div>

	{#if form}
		{#if form.success}
			<section class="feedback success" role="status" aria-live="polite">
				<p>{form.message ?? 'Action completed successfully.'}</p>
			</section>
		{:else if form.error}
			<section class="feedback error" role="alert">
				<p>{form.error}</p>
			</section>
		{/if}
	{/if}

	<section class="data-section" aria-labelledby="search-heading">
		<h2 id="search-heading">Find a comment</h2>
		<form method="GET" class="search-form" role="search">
			<div class="field-group grow">
				<label for="mention-search">Permalink or text</label>
				<input
					id="mention-search"
					name="q"
					type="text"
					value={q}
					placeholder="https://www.reddit.com/r/orangecounty/comments/…"
					autocomplete="off"
				/>
			</div>
			<button type="submit">Search</button>
		</form>

		{#if q}
			<p class="section-hint">
				{results.length} comment{results.length === 1 ? '' : 's'} matched{results.length === 50
					? ' (showing the first 50)'
					: ''}.
			</p>
			{#if results.length > 0}
				<div class="table-wrap">
					<table class="data-table">
						<thead>
							<tr>
								<th scope="col">Quote</th>
								<th scope="col">Restaurants</th>
								<th scope="col">State</th>
								<th scope="col">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each results as c (`${c.threadId}/${c.commentId}`)}
								{@render commentRow(c)}
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="empty">No comment matches.</p>
			{/if}
		{/if}
	</section>

	<section class="data-section" aria-labelledby="taken-down-heading">
		<h2 id="taken-down-heading">Taken down</h2>
		<p class="section-hint">
			{takenDown.length} comment{takenDown.length === 1 ? '' : 's'} hidden from the public site.
		</p>
		{#if takenDown.length > 0}
			<div class="table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th scope="col">Quote</th>
							<th scope="col">Restaurants</th>
							<th scope="col">State</th>
							<th scope="col">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each takenDown as c (`${c.threadId}/${c.commentId}`)}
							{@render commentRow(c)}
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="empty">Nothing has been taken down.</p>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem 1.5rem 3rem;
		font-family: 'DM Sans', system-ui, sans-serif;
	}

	header {
		margin-bottom: 1.5rem;
	}

	h1 {
		font-family: 'DM Serif Display', Georgia, serif;
		font-size: 1.75rem;
		font-weight: 400;
		margin: 0 0 0.5rem;
		color: #3e2c23;
		letter-spacing: -0.01em;
	}

	h2 {
		font-family: 'DM Serif Display', Georgia, serif;
		font-size: 1.15rem;
		font-weight: 400;
		margin: 0 0 0.35rem;
		color: #3e2c23;
	}

	.subtitle,
	.section-hint {
		color: #7a6e63;
		font-size: 0.95rem;
		line-height: 1.5;
		margin: 0;
	}

	.section-hint {
		margin: 0.75rem 0;
		font-size: 0.88rem;
	}

	.queue-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		align-items: center;
		padding: 0.75rem 1rem;
		margin-bottom: 1.25rem;
		background: #fff3eb;
		border: 1px solid rgba(255, 69, 0, 0.25);
		border-radius: 10px;
		font-size: 0.92rem;
		color: #3e2c23;
	}

	.feedback {
		padding: 0.85rem 1rem;
		border-radius: 10px;
		margin-bottom: 1.25rem;
	}

	.feedback p {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 500;
	}

	.feedback.success {
		background: rgba(38, 132, 64, 0.08);
		border: 1px solid rgba(38, 132, 64, 0.25);
		color: #1e5e2f;
	}

	.feedback.error {
		background: rgba(200, 50, 50, 0.08);
		border: 1px solid rgba(200, 50, 50, 0.25);
		color: #a52121;
	}

	.data-section {
		margin-bottom: 2rem;
	}

	.search-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
		background: #fffdf9;
		border: 1px solid #e2d9ce;
		border-radius: 10px;
		padding: 1rem;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.field-group.grow {
		flex: 1 1 14rem;
	}

	.field-group label {
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #7a6e63;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid #e2d9ce;
		border-radius: 10px;
		background: #fffdf9;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
		min-width: 40rem;
	}

	.data-table th,
	.data-table td {
		padding: 0.65rem 0.75rem;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid #efe8df;
	}

	.data-table th {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #7a6e63;
		background: #faf7f2;
		white-space: nowrap;
	}

	.data-table tr:last-child td {
		border-bottom: none;
	}

	.quote-cell {
		width: 45%;
	}

	.quote {
		margin: 0 0 0.3rem;
		color: #3e2c23;
		line-height: 1.45;
	}

	.meta {
		margin: 0;
		font-size: 0.78rem;
		color: #7a6e63;
	}

	.meta a {
		color: #c43700;
	}

	.subtitle a {
		color: #c43700;
	}

	.actions-cell {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.action-form {
		display: inline;
	}

	input[type='text'] {
		padding: 0.45rem 0.6rem;
		font-size: 0.82rem;
		font-family: inherit;
		border: 1px solid #d6cec5;
		border-radius: 6px;
		background: #fffdf9;
		color: #3e2c23;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	input[type='text']:focus-visible {
		outline: none;
		border-color: #ff4500;
		box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.15);
	}

	button {
		padding: 0.5rem 0.85rem;
		font-size: 0.82rem;
		font-family: inherit;
		font-weight: 600;
		border: none;
		border-radius: 6px;
		background: #c43700;
		color: #fffdf9;
		cursor: pointer;
		transition: background-color 0.15s ease, transform 0.05s ease;
		white-space: nowrap;
	}

	button:hover:not(:disabled) {
		background: #a82f00;
	}

	button:active:not(:disabled) {
		transform: translateY(1px);
	}

	.btn-secondary {
		background: transparent;
		color: #7a6e63;
		border: 1px solid #d6cec5;
	}

	.btn-secondary:hover:not(:disabled) {
		background: rgba(255, 69, 0, 0.06);
		color: #3e2c23;
		border-color: #c9bfb4;
	}

	.empty {
		margin: 0.75rem 0 0;
		font-size: 0.88rem;
		color: #a8988a;
		font-style: italic;
	}

	@media (max-width: 640px) {
		main {
			padding: 1.5rem 1rem 2rem;
		}

		h1 {
			font-size: 1.4rem;
		}
	}
</style>
