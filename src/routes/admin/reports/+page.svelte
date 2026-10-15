<script lang="ts">
	import { enhance } from '$app/forms';
	import { REPORT_TYPE_LABELS, type ReportType } from '$lib/restaurants/report-problem';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const { pending, recent } = $derived(data);

	function formatWhen(value: string | null): string {
		if (!value) return 'Unknown time';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown time';
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'America/Los_Angeles',
		}).format(date);
	}

	function typeLabel(type: ReportType): string {
		return REPORT_TYPE_LABELS[type];
	}

	function consequence(type: ReportType): string {
		if (type === 'closed') return 'Accept hides this restaurant and keeps its data. Reason: closed.';
		if (type === 'chain') {
			return 'Accept hides this restaurant and keeps its data. It does not add the brand to the chain registry. Reason: chain.';
		}
		if (type === 'moved') {
			return 'The restaurant stays public. Accept writes only the fields you mark accept.';
		}
		if (type === 'duplicate') {
			return 'Accept merges the two restaurants. Comments move to the one you keep, and the other name still redirects.';
		}
		return 'The restaurant stays public. Accept writes only the details you mark accept.';
	}
</script>

<svelte:head>
	<title>Reports</title>
</svelte:head>

<main>
	<header>
		<h1>Reports</h1>
		<p class="subtitle">
			Visitor problem reports stay off the public site until you accept or dismiss them.
			Quote removal still arrives by email and is handled on Takedowns.
		</p>
	</header>

	<div class="queue-summary" role="status">
		<span><strong>{pending.length}</strong> waiting</span>
		<span aria-hidden="true">·</span>
		<span><strong>{recent.length}</strong> recent decisions</span>
	</div>

	{#if form}
		{#if form.success}
			<section class="feedback success" role="status" aria-live="polite">
				<p>{form.message}</p>
			</section>
		{:else if form.error}
			<section class="feedback error" role="alert">
				<p>{form.error}</p>
			</section>
		{/if}
	{/if}

	<section class="queue" aria-labelledby="pending-heading">
		<h2 id="pending-heading">Waiting for review</h2>
		{#if pending.length === 0}
			<p class="empty">No reports waiting.</p>
		{/if}
		{#each pending as report (report.id)}
			<article class="card">
				<header class="card-head">
					<div>
						<h3>{report.restaurant.name}</h3>
						<p class="meta">
							{typeLabel(report.type)} · {formatWhen(report.createdAt)}
							{#if report.restaurant.location}
								· {report.restaurant.location}
							{/if}
						</p>
					</div>
					<a href="/r/{encodeURIComponent(report.restaurant.slug)}">Public page</a>
				</header>
				<p class="consequence">{consequence(report.type)}</p>
				{#if report.note}
					<p class="note"><span>Visitor note:</span> {report.note}</p>
				{/if}
				{#if report.mapsUrl}
					<p class="note">
						<a href={report.mapsUrl} target="_blank" rel="noopener noreferrer">Open the map link</a>
					</p>
				{/if}

				{#if report.type === 'duplicate'}
					{#if report.duplicate}
						<p class="note">
							<span>Other restaurant:</span>
							{report.duplicate.name}
							{#if report.duplicate.location}
								· {report.duplicate.location}
							{/if}
							{#if report.duplicate.lat != null && report.duplicate.lng != null}
								· {report.duplicate.lat.toFixed(5)}, {report.duplicate.lng.toFixed(5)}
							{/if}
						</p>
					{/if}
					{#if report.duplicate?.available}
						<form method="POST" action="?/merge" use:enhance class="fields">
							<input type="hidden" name="reportId" value={report.id} />
							<fieldset>
								<legend>Which restaurant stays on the site?</legend>
								<label>
									<input type="radio" name="keep" value="other" checked />
									Keep {report.duplicate.name}
								</label>
								<label>
									<input type="radio" name="keep" value="subject" />
									Keep {report.restaurant.name}
								</label>
							</fieldset>
							<div class="actions">
								<button type="submit">Merge and keep the selected restaurant for {report.restaurant.name}</button>
							</div>
						</form>
					{:else}
						<p class="note">The other restaurant is no longer on the site. Dismiss this report.</p>
					{/if}
					<form method="POST" action="?/dismiss" use:enhance class="actions">
						<input type="hidden" name="reportId" value={report.id} />
						<button type="submit" class="secondary">Dismiss report for {report.restaurant.name}</button>
					</form>
				{:else if report.type === 'closed' || report.type === 'chain'}
					<div class="actions">
						<form method="POST" action="?/accept" use:enhance>
							<input type="hidden" name="reportId" value={report.id} />
							<button type="submit">Hide {report.restaurant.name} from the public site</button>
						</form>
						<form method="POST" action="?/dismiss" use:enhance>
							<input type="hidden" name="reportId" value={report.id} />
							<button type="submit" class="secondary">Dismiss report for {report.restaurant.name}</button>
						</form>
					</div>
				{:else}
					<form method="POST" action="?/apply" use:enhance class="fields">
						<input type="hidden" name="reportId" value={report.id} />
						{#each report.proposals as proposal (proposal.key)}
							<fieldset>
								<legend>{proposal.label}</legend>
								<p>Current: {proposal.current}</p>
								<p>Proposed: {proposal.proposed}</p>
								<label>
									<input type="radio" name={proposal.key} value="accepted" required />
									Accept {proposal.label} for {report.restaurant.name}
								</label>
								<label>
									<input type="radio" name={proposal.key} value="rejected" />
									Reject {proposal.label} for {report.restaurant.name}
								</label>
							</fieldset>
						{/each}
						<div class="actions">
							<button type="submit">Apply selected changes for {report.restaurant.name}</button>
						</div>
					</form>
					<form method="POST" action="?/dismiss" use:enhance class="actions">
						<input type="hidden" name="reportId" value={report.id} />
						<button type="submit" class="secondary">Dismiss report for {report.restaurant.name}</button>
					</form>
				{/if}
			</article>
		{/each}
	</section>

	<section class="queue" aria-labelledby="recent-heading">
		<h2 id="recent-heading">Recent decisions</h2>
		{#if recent.length === 0}
			<p class="empty">No reviewed reports yet.</p>
		{:else}
			<ul class="recent">
				{#each recent as report (report.id)}
					<li>
						<strong>{report.subjectName}</strong>
						<span>{typeLabel(report.type)} · {report.status} · {formatWhen(report.resolvedAt)}</span>
						<span>{report.summary}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		font-family: 'DM Sans', system-ui, sans-serif;
		color: #3e2c23;
	}

	h1, h2, h3 { font-family: 'DM Serif Display', Georgia, serif; font-weight: 400; }
	h1 { margin: 0 0 0.5rem; }
	h2 { font-size: 1.5rem; margin: 0 0 0.75rem; }
	h3 { margin: 0; font-size: 1.35rem; }
	.subtitle, .meta, .empty, .note { color: #64594e; }
	.queue-summary { display: flex; gap: 0.5rem; margin: 1rem 0 1.5rem; }
	.feedback { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; }
	.success { background: #eef6e8; }
	.error { background: #fdecea; }
	.card {
		background: #fffdf9;
		border: 1px solid #e2d9ce;
		border-radius: 10px;
		padding: 1rem 1.1rem;
		margin-bottom: 1rem;
	}
	.card-head, .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; justify-content: space-between; }
	.actions { justify-content: flex-start; margin-top: 0.75rem; }
	.consequence { margin: 0.75rem 0; }
	fieldset { border: 1px solid #e2d9ce; border-radius: 8px; margin: 0.75rem 0; }
	label { display: flex; gap: 0.4rem; align-items: center; min-height: 44px; }
	button, a {
		font: inherit;
		color: #a52e00;
	}
	button {
		min-height: 44px;
		padding: 0.45rem 0.8rem;
		border-radius: 6px;
		border: 1px solid #c43700;
		background: #c43700;
		color: #fffdf9;
		cursor: pointer;
	}
	button.secondary { background: #fffdf9; color: #3e2c23; border-color: #d4c8bb; }
	.recent { list-style: none; padding: 0; margin: 0; }
	.recent li { display: grid; gap: 0.15rem; padding: 0.75rem 0; border-top: 1px solid #e2d9ce; }
</style>
