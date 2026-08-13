<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { stats, unresolved, negativeCache, unresolvedTotal } = $derived(data);

	function fmtPercent(n: number): string {
		return `${n.toFixed(1)}%`;
	}

	function fmtCount(n: number): string {
		return n.toLocaleString();
	}

	function fmtRetryStatus(active: boolean, retryAfter: Date | string | null): string {
		if (!retryAfter) return 'No retry scheduled';
		const when = new Date(retryAfter).toLocaleString();
		return active ? `Active until ${when}` : `Expired (${when})`;
	}

	function displayValue(value: string | null | undefined): string {
		return value?.trim() ? value : '—';
	}
</script>

<svelte:head>
	<title>Geocode Health</title>
</svelte:head>

<main>
	<header>
		<h1>Geocode Health</h1>
		<p class="subtitle">
			Monitor geocode cache performance, inspect provider and failure patterns, and manually correct
			restaurants that are still missing coordinates. Use negative-cache actions to clear stale
			entries or force a retry.
		</p>
	</header>

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

	<section class="stats" aria-label="Geocode cache statistics">
		<div class="stat-card">
			<span class="stat-label">Total cached</span>
			<span class="stat-value">{fmtCount(stats.totalCached)}</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Success rate</span>
			<span class="stat-value accent">{fmtPercent(stats.successRate)}</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Failures</span>
			<span class="stat-value">{fmtCount(stats.failures)}</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Active negative cache</span>
			<span class="stat-value">{fmtCount(stats.activeNegative)}</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Unresolved restaurants</span>
			<span class="stat-value">{fmtCount(unresolvedTotal)}</span>
		</div>
	</section>

	<section class="breakdown" aria-label="Cache breakdown">
		<div class="panel">
			<h2>Provider breakdown</h2>
			{#if stats.providerBreakdown.length > 0}
				<table>
					<thead>
						<tr>
							<th scope="col">Provider</th>
							<th scope="col" class="num">Count</th>
						</tr>
					</thead>
					<tbody>
						{#each stats.providerBreakdown as row (row.provider)}
							<tr>
								<td>{row.provider}</td>
								<td class="num">{fmtCount(row.count)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">No successful geocodes yet.</p>
			{/if}
		</div>

		<div class="panel">
			<h2>Top failure details</h2>
			{#if stats.topFailures.length > 0}
				<table>
					<thead>
						<tr>
							<th scope="col">Detail</th>
							<th scope="col" class="num">Count</th>
						</tr>
					</thead>
					<tbody>
						{#each stats.topFailures as row (row.detail ?? 'unknown')}
							<tr>
								<td>{displayValue(row.detail)}</td>
								<td class="num">{fmtCount(row.count)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">No failure records.</p>
			{/if}
		</div>

		<div class="panel">
			<h2>Top geocoded cities</h2>
			{#if stats.topCities.length > 0}
				<table>
					<thead>
						<tr>
							<th scope="col">City</th>
							<th scope="col" class="num">Count</th>
						</tr>
					</thead>
					<tbody>
						{#each stats.topCities as row (row.city ?? 'unknown')}
							<tr>
								<td>{displayValue(row.city)}</td>
								<td class="num">{fmtCount(row.count)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">No city data yet.</p>
			{/if}
		</div>
	</section>

	<section class="data-section" aria-labelledby="unresolved-heading">
		<h2 id="unresolved-heading">Unresolved restaurants</h2>
		<p class="section-hint">
			Showing {unresolved.length} of {fmtCount(unresolvedTotal)} restaurants missing coordinates.
			Provide a Google Maps URL, address, or lat/lng to correct each entry.
		</p>

		{#if unresolved.length > 0}
			<div class="table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th scope="col">Name</th>
							<th scope="col">Location</th>
							<th scope="col">Street</th>
							<th scope="col">Cuisine</th>
							<th scope="col">Correction</th>
						</tr>
					</thead>
					<tbody>
						{#each unresolved as restaurant (restaurant.id)}
							<tr>
								<td class="name-cell">{restaurant.name}</td>
								<td>{displayValue(restaurant.location)}</td>
								<td>{displayValue(restaurant.street)}</td>
								<td>{displayValue(restaurant.cuisine)}</td>
								<td class="form-cell">
									<form
										method="POST"
										action="?/correctRestaurant"
										use:enhance
										class="inline-form"
									>
										<input type="hidden" name="restaurantId" value={restaurant.id} />
										<div class="field-group">
											<label for="maps-url-{restaurant.id}">Google Maps URL</label>
											<input
												id="maps-url-{restaurant.id}"
												name="mapsUrl"
												type="url"
												placeholder="https://maps.google.com/…"
												autocomplete="off"
											/>
										</div>
										<div class="field-group">
											<label for="address-{restaurant.id}">Address</label>
											<input
												id="address-{restaurant.id}"
												name="address"
												type="text"
												placeholder="123 Main St, Irvine, CA"
												autocomplete="off"
											/>
										</div>
										<div class="field-group">
											<label for="latlng-{restaurant.id}">Lat / Lng</label>
											<input
												id="latlng-{restaurant.id}"
												name="latLng"
												type="text"
												placeholder="33.6846, -117.8265"
												autocomplete="off"
											/>
										</div>
										<button type="submit">Correct</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="empty">All restaurants have coordinates.</p>
		{/if}
	</section>

	<section class="data-section" aria-labelledby="negative-cache-heading">
		<h2 id="negative-cache-heading">Negative cache</h2>
		<p class="section-hint">
			Failed geocode queries cached to avoid repeat lookups. Clear an entry to remove it, or force
			retry to allow the pipeline to try again.
		</p>

		{#if negativeCache.length > 0}
			<div class="table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th scope="col">Query</th>
							<th scope="col">Provider</th>
							<th scope="col">Detail</th>
							<th scope="col">Retry status</th>
							<th scope="col">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each negativeCache as entry (entry.id)}
							<tr>
								<td class="query-cell">{entry.query}</td>
								<td>{entry.provider}</td>
								<td>{displayValue(entry.detail)}</td>
								<td>
									<span class="retry-badge" class:active={entry.active}>
										{fmtRetryStatus(entry.active, entry.retryAfter)}
									</span>
								</td>
								<td class="actions-cell">
									<form method="POST" action="?/clearCacheEntry" use:enhance class="action-form">
										<input type="hidden" name="cacheId" value={entry.id} />
										<button type="submit" class="btn-secondary">Clear</button>
									</form>
									<form
										method="POST"
										action="?/forceRetryCacheEntry"
										use:enhance
										class="action-form"
									>
										<input type="hidden" name="cacheId" value={entry.id} />
										<button type="submit">Force retry</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="empty">No negative cache entries.</p>
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
		margin: 0 0 0.5rem;
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
		margin-bottom: 0.75rem;
		font-size: 0.88rem;
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

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.stat-card {
		background: #fffdf9;
		border: 1px solid #e2d9ce;
		border-radius: 10px;
		padding: 0.85rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #7a6e63;
	}

	.stat-value {
		font-size: 1.35rem;
		font-weight: 600;
		color: #3e2c23;
		font-variant-numeric: tabular-nums;
	}

	.stat-value.accent {
		color: #c43700;
	}

	.breakdown {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.panel {
		background: #fffdf9;
		border: 1px solid #e2d9ce;
		border-radius: 10px;
		padding: 1rem;
	}

	.panel table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}

	.panel th,
	.panel td {
		padding: 0.4rem 0.35rem;
		text-align: start;
		border-bottom: 1px solid #efe8df;
	}

	.panel th {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #7a6e63;
	}

	.panel tr:last-child td {
		border-bottom: none;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.data-section {
		margin-bottom: 2rem;
	}

	.data-section h2 {
		margin-bottom: 0.35rem;
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
		min-width: 42rem;
	}

	.data-table th,
	.data-table td {
		padding: 0.65rem 0.75rem;
		text-align: start;
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
		white-space: nowrap;
	}

	.query-cell {
		max-width: 16rem;
		word-break: break-word;
	}

	.form-cell {
		min-width: 14rem;
	}

	.inline-form {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.field-group label {
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #7a6e63;
	}

	input[type='text'],
	input[type='url'] {
		padding: 0.45rem 0.6rem;
		font-size: 0.82rem;
		font-family: inherit;
		border: 1px solid #d6cec5;
		border-radius: 6px;
		background: #fffdf9;
		color: #3e2c23;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	input[type='text']:focus-visible,
	input[type='url']:focus-visible {
		outline: none;
		border-color: #ff4500;
		box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.15);
	}

	input:user-invalid {
		border-color: #b5543a;
	}

	input:user-invalid:focus-visible {
		outline: none;
		border-color: #b5543a;
		box-shadow: 0 0 0 3px rgba(181, 84, 58, 0.2);
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

	button:disabled {
		background: #c9bfb4;
		cursor: not-allowed;
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

	.actions-cell {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: flex-start;
	}

	.action-form {
		display: inline;
	}

	.retry-badge {
		display: inline-block;
		font-size: 0.78rem;
		color: #7a6e63;
		line-height: 1.4;
	}

	.retry-badge.active {
		color: #a8533d;
		font-weight: 500;
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

		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
