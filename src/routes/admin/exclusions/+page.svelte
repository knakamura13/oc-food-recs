<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { pendingReview, excluded } = $derived(data);

	const REASON_LABELS: Record<string, string> = {
		chain: 'Chain (registry)',
		corporate_group: 'Corporate group (registry)',
		llm_suspected_chain: 'LLM flagged as chain',
		many_locations: 'Many global locations',
		multi_city_density: 'Same name across many cities',
		duplicate_candidate: 'Likely duplicate at same location'
	};

	function reasonLabel(reason: string | null): string {
		if (!reason) return '—';
		return REASON_LABELS[reason] ?? reason;
	}

	function displayValue(value: string | null | undefined): string {
		return value?.trim() ? value : '—';
	}
</script>

<svelte:head>
	<title>Exclusions</title>
</svelte:head>

<main>
	<header>
		<h1>Exclusions</h1>
		<p class="subtitle">
			Keep chains and corporate restaurant groups off the public site. The curated registry
			auto-excludes known brands; fuzzy signals (LLM, location count, multi-city density) only flag
			restaurants for review here — they stay public until you confirm. Confirming or restoring a
			restaurant locks that decision so re-ingests and the registry sweep won't undo it.
		</p>
	</header>

	<div class="queue-summary" role="status">
		<span><strong>{pendingReview.length}</strong> pending review</span>
		<span aria-hidden="true">·</span>
		<span><strong>{excluded.length}</strong> excluded</span>
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

	<section class="data-section" aria-labelledby="add-brand-heading">
		<h2 id="add-brand-heading">Add a brand to the registry</h2>
		<p class="section-hint">
			Adds (or refreshes) a brand so future ingests and the <code>apply_exclusions</code> sweep
			exclude it everywhere. Names are fuzzy-matched, so the base brand is enough (e.g. “Vox Kitchen”
			catches “Vox Kitchen Fountain Valley”).
		</p>
		<form method="POST" action="?/addBrand" use:enhance class="add-brand-form">
			<div class="field-group grow">
				<label for="add-brand-name">Brand name</label>
				<input id="add-brand-name" name="brandName" type="text" placeholder="Vox Kitchen" autocomplete="off" required />
			</div>
			<div class="field-group">
				<label for="add-brand-reason">Reason</label>
				<select id="add-brand-reason" name="reason">
					<option value="chain">Chain</option>
					<option value="corporate_group">Corporate group</option>
				</select>
			</div>
			<div class="field-group">
				<label for="add-brand-group">Group (optional)</label>
				<input id="add-brand-group" name="groupName" type="text" placeholder="Kei Concepts" autocomplete="off" />
			</div>
			<button type="submit">Add brand</button>
		</form>
	</section>

	<section class="data-section" aria-labelledby="pending-heading">
		<h2 id="pending-heading">Pending review</h2>
		<p class="section-hint">
			{pendingReview.length} restaurant{pendingReview.length === 1 ? '' : 's'} flagged by a fuzzy
			signal. These are still public — confirm an exclusion or keep them active.
		</p>

		{#if pendingReview.length > 0}
			<div class="table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th scope="col">Name</th>
							<th scope="col">Location</th>
							<th scope="col">Flagged as</th>
							<th scope="col">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each pendingReview as r (r.id)}
							<tr>
								<td class="name-cell">{r.name}</td>
								<td>{displayValue(r.location)}</td>
								<td>{reasonLabel(r.exclusionReason)}</td>
								<td class="actions-cell">
									<form method="POST" action="?/excludeRestaurant" use:enhance class="exclude-form">
										<input type="hidden" name="restaurantId" value={r.id} />
										<input type="hidden" name="brandName" value={r.name} />
										<select name="reason" aria-label="Exclusion reason for {r.name}">
											<option value="chain">Chain</option>
											<option value="corporate_group">Corporate group</option>
										</select>
										<label class="checkbox">
											<input type="checkbox" name="addToRegistry" />
											Add to registry
										</label>
										<button type="submit">Exclude</button>
									</form>
									<form method="POST" action="?/restoreRestaurant" use:enhance class="action-form">
										<input type="hidden" name="restaurantId" value={r.id} />
										<button type="submit" class="btn-secondary">Keep active</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="empty">Nothing awaiting review.</p>
		{/if}
	</section>

	<section class="data-section" aria-labelledby="excluded-heading">
		<h2 id="excluded-heading">Excluded</h2>
		<p class="section-hint">
			{excluded.length} restaurant{excluded.length === 1 ? '' : 's'} hidden from the public site.
			Restore one to make it visible again (and lock it against re-exclusion).
		</p>

		{#if excluded.length > 0}
			<div class="table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th scope="col">Name</th>
							<th scope="col">Location</th>
							<th scope="col">Reason</th>
							<th scope="col">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each excluded as r (r.id)}
							<tr>
								<td class="name-cell">{r.name}</td>
								<td>{displayValue(r.location)}</td>
								<td>{reasonLabel(r.exclusionReason)}</td>
								<td class="actions-cell">
									<form method="POST" action="?/restoreRestaurant" use:enhance class="action-form">
										<input type="hidden" name="restaurantId" value={r.id} />
										<button type="submit">Restore to active</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="empty">No restaurants are excluded.</p>
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

	.section-hint {
		margin-bottom: 0.75rem;
		font-size: 0.88rem;
	}

	.section-hint code {
		font-family: 'DM Mono', ui-monospace, monospace;
		font-size: 0.82rem;
		background: #f1eae1;
		padding: 0.05rem 0.3rem;
		border-radius: 4px;
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

	.add-brand-form {
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

	.field-group label,
	.checkbox {
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

	.name-cell {
		font-weight: 600;
		color: #3e2c23;
	}

	.actions-cell {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.exclude-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.action-form {
		display: inline;
	}

	.checkbox {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 500;
		color: #7a6e63;
	}

	input[type='text'],
	select {
		padding: 0.45rem 0.6rem;
		font-size: 0.82rem;
		font-family: inherit;
		border: 1px solid #d6cec5;
		border-radius: 6px;
		background: #fffdf9;
		color: #3e2c23;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	input[type='text']:focus,
	select:focus {
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
		background: #ff4500;
		color: #fffdf9;
		cursor: pointer;
		transition: background-color 0.15s ease, transform 0.05s ease;
		white-space: nowrap;
	}

	button:hover:not(:disabled) {
		background: #e63e00;
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
		margin: 0;
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
