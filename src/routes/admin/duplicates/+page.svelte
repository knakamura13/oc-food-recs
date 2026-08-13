<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { duplicates } = $derived(data);

	function displayValue(value: string | null | undefined): string {
		return value?.trim() ? value : '—';
	}

	function fmtCoords(lat: number | null, lng: number | null): string {
		if (lat == null || lng == null) return '—';
		return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
	}

	/** Group flagged rows by slug prefix / proximity heuristics for side-by-side review. */
	const groups = $derived.by(() => {
		const bySlugRoot = new Map<string, typeof duplicates>();
		for (const row of duplicates) {
			const root = row.slug.replace(/-\d+$/, '');
			const bucket = bySlugRoot.get(root) ?? [];
			bucket.push(row);
			bySlugRoot.set(root, bucket);
		}
		return [...bySlugRoot.values()];
	});
</script>

<svelte:head>
	<title>Duplicate Review</title>
</svelte:head>

<main>
	<header>
		<h1>Duplicate Review</h1>
		<p class="subtitle">
			Restaurants flagged as likely duplicates at the same location (typo name variants or
			ambiguous fuzzy matches). High-confidence pairs are merged automatically during dedupe;
			these entries need a human decision.
		</p>
	</header>

	<div class="queue-summary" role="status">
		<span><strong>{duplicates.length}</strong> flagged for review</span>
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

	{#if duplicates.length === 0}
		<p class="empty">No duplicate candidates in the review queue.</p>
	{:else}
		{#each groups as group, index (index)}
			<section class="group-card">
				<h2>Candidate group {index + 1}</h2>
				<div class="group-grid">
					{#each group as row (row.id)}
						<article class="restaurant-card">
							<h3>{row.name}</h3>
							<dl>
								<div>
									<dt>Slug</dt>
									<dd><code>{row.slug}</code></dd>
								</div>
								<div>
									<dt>Location</dt>
									<dd>{displayValue(row.location)}</dd>
								</div>
								<div>
									<dt>Coordinates</dt>
									<dd>{fmtCoords(row.lat, row.lng)}</dd>
								</div>
								<div>
									<dt>Mentions</dt>
									<dd>{row.mentionCount ?? 0}</dd>
								</div>
							</dl>
							<form method="POST" action="?/keepSeparate" use:enhance class="inline-form">
								<input type="hidden" name="restaurantId" value={row.id} />
								<button type="submit" class="secondary">Keep separate</button>
							</form>
						</article>
					{/each}
				</div>

				{#if group.length >= 2}
					<form method="POST" action="?/mergeRestaurants" use:enhance class="merge-form">
						<label for="winner-{index}">Merge into (winner)</label>
						<select id="winner-{index}" name="winnerId" required>
							{#each group as row (row.id)}
								<option value={row.id}>
									{row.name} ({row.mentionCount ?? 0} mentions)
								</option>
							{/each}
						</select>
						<label for="loser-{index}">Remove (loser)</label>
						<select id="loser-{index}" name="loserId" required>
							{#each group as row (row.id)}
								<option value={row.id}>{row.name}</option>
							{/each}
						</select>
						<button type="submit">Merge selected pair</button>
					</form>
				{/if}
			</section>
		{/each}
	{/if}
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 1.5rem;
		font-family: 'DM Sans', system-ui, sans-serif;
		color: #3e2c23;
	}

	header {
		margin-bottom: 1.25rem;
	}

	h1 {
		margin: 0 0 0.35rem;
		font-size: 1.75rem;
		font-weight: 700;
	}

	.subtitle {
		margin: 0;
		color: #7a6e63;
		line-height: 1.5;
		max-width: 62ch;
	}

	.queue-summary {
		margin-bottom: 1rem;
		font-size: 0.95rem;
		color: #5c4f45;
	}

	.feedback {
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.feedback.success {
		background: #edf7ef;
		border: 1px solid #b8dfc0;
	}

	.feedback.error {
		background: #fdeeee;
		border: 1px solid #efb8b8;
	}

	.empty {
		color: #7a6e63;
	}

	.group-card {
		background: #fffdf9;
		border: 1px solid #e2d9ce;
		border-radius: 12px;
		padding: 1rem 1.25rem;
		margin-bottom: 1rem;
	}

	.group-card h2 {
		margin: 0 0 0.75rem;
		font-size: 1.05rem;
	}

	.group-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.restaurant-card {
		border: 1px solid #ece3d9;
		border-radius: 10px;
		padding: 0.75rem;
		background: #faf7f2;
	}

	.restaurant-card h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}

	dl {
		margin: 0 0 0.75rem;
		display: grid;
		gap: 0.35rem;
		font-size: 0.88rem;
	}

	dt {
		font-weight: 600;
		color: #7a6e63;
	}

	dd {
		margin: 0;
	}

	.merge-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: end;
		padding-top: 0.5rem;
		border-top: 1px solid #ece3d9;
	}

	.merge-form label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #7a6e63;
	}

	select {
		min-width: 220px;
		padding: 0.45rem 0.55rem;
		border-radius: 8px;
		border: 1px solid #d8cdc1;
		background: #fff;
		font: inherit;
	}

	select:user-invalid {
		border-color: #b5543a;
	}

	select:user-invalid:focus-visible {
		outline: none;
		border-color: #b5543a;
		box-shadow: 0 0 0 3px rgba(181, 84, 58, 0.2);
	}

	button {
		padding: 0.5rem 0.9rem;
		border-radius: 8px;
		border: none;
		background: #ff4500;
		color: #fff;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	button.secondary {
		background: #fff;
		color: #3e2c23;
		border: 1px solid #d8cdc1;
	}

	.inline-form {
		margin: 0;
	}
</style>
