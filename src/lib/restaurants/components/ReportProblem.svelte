<script lang="ts">
	import { Flag } from 'lucide-svelte';
	import type { Attachment } from 'svelte/attachments';
	import { toast } from '$lib/toast';
	import { REPORT_TYPE_LABELS, type ReportType } from '$lib/restaurants/report-problem';

	interface DuplicateChoice {
		slug: string;
		name: string;
		location: string | null;
		street: string | null;
	}

	interface ReportRestaurant {
		slug: string;
		name: string;
		location: string | null;
		street: string | null;
		cuisine: string | null;
	}

	let {
		restaurant,
		placement = 'drawer',
	}: {
		restaurant: ReportRestaurant;
		placement?: 'drawer' | 'page';
	} = $props();

	const choices: ReportType[] = ['closed', 'moved', 'wrong_detail', 'chain', 'duplicate'];

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let formOpen = $state(false);
	const captureDialog: Attachment<HTMLDialogElement> = (node) => {
		dialogEl = node;
		showDialog(node);
		return () => {
			if (dialogEl === node) dialogEl = null;
		};
	};
	let type = $state<ReportType | ''>('');
	let note = $state('');
	let name = $state('');
	let city = $state('');
	let street = $state('');
	let cuisine = $state('');
	let moveCity = $state('');
	let moveStreet = $state('');
	let mapsUrl = $state('');
	let duplicateSlug = $state('');
	let search = $state('');
	let nearby = $state<DuplicateChoice[]>([]);
	let matches = $state<DuplicateChoice[]>([]);
	let searched = $state(false);
	let pending = $state<ReportType[]>([]);
	let error = $state('');
	let submitting = $state(false);

	let waiting = $derived(type !== '' && pending.includes(type));
	let choicesToShow = $derived(searched ? matches : nearby);
	let placeLabel = $derived(
		[restaurant.location, restaurant.street].filter(Boolean).join(' · ') || 'Location unknown'
	);

	function showDialog(dialog: HTMLDialogElement) {
		try {
			if (typeof dialog.showModal === 'function') {
				dialog.showModal();
				return;
			}
		} catch {
			// jsdom has no modal dialog.
		}
		dialog.setAttribute('open', '');
	}

	function hideDialog(dialog: HTMLDialogElement) {
		if (typeof dialog.close === 'function') dialog.close();
		else dialog.removeAttribute('open');
	}

	function resetFields() {
		type = '';
		note = '';
		name = restaurant.name;
		city = restaurant.location ?? '';
		street = restaurant.street ?? '';
		cuisine = restaurant.cuisine ?? '';
		moveCity = '';
		moveStreet = '';
		mapsUrl = '';
		duplicateSlug = '';
		search = '';
		matches = [];
		searched = false;
		error = '';
	}

	async function open() {
		resetFields();
		formOpen = true;
		try {
			const res = await fetch(`/api/r/${encodeURIComponent(restaurant.slug)}/reports`);
			if (!res.ok) return;
			const data = (await res.json()) as { pending?: ReportType[]; nearby?: DuplicateChoice[] };
			pending = Array.isArray(data.pending) ? data.pending : [];
			nearby = Array.isArray(data.nearby) ? data.nearby : [];
		} catch {
			pending = [];
		}
	}

	async function findMatches() {
		const q = search.trim();
		if (q.length < 2) {
			matches = [];
			searched = false;
			return;
		}
		try {
			const res = await fetch(`/api/r/${encodeURIComponent(restaurant.slug)}/reports?q=${encodeURIComponent(q)}`);
			if (!res.ok) return;
			const data = (await res.json()) as { matches?: DuplicateChoice[] };
			matches = Array.isArray(data.matches) ? data.matches : [];
			searched = true;
			if (!matches.some((choice) => choice.slug === duplicateSlug)) duplicateSlug = '';
		} catch {
			matches = [];
		}
	}

	function close() {
		if (dialogEl) hideDialog(dialogEl);
		formOpen = false;
	}

	function payload(): Record<string, string> {
		const body: Record<string, string> = {};
		if (note.trim()) body.note = note.trim();
		if (type === 'wrong_detail') {
			body.name = name;
			body.location = city;
			body.street = street;
			body.cuisine = cuisine;
		}
		if (type === 'moved') {
			if (moveCity.trim()) body.location = moveCity.trim();
			if (moveStreet.trim()) body.street = moveStreet.trim();
		}
		if ((type === 'moved' || type === 'wrong_detail') && mapsUrl.trim()) body.mapsUrl = mapsUrl.trim();
		if (type === 'duplicate' && duplicateSlug) body.duplicateSlug = duplicateSlug;
		return body;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!type || waiting || submitting || (type === 'duplicate' && !duplicateSlug)) return;
		submitting = true;
		error = '';
		try {
			const res = await fetch(`/api/r/${encodeURIComponent(restaurant.slug)}/reports`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type, ...payload() }),
			});
			const data = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
			if (res.status === 429) {
				toast.error('Too many reports. Try again later');
				return;
			}
			if (data.result === 'filed') {
				toast.success('Report sent. It stays private until it is reviewed.');
				pending = [...pending, type];
				close();
				return;
			}
			if (data.result === 'already_pending') {
				toast.info('This report is already waiting for review');
				pending = pending.includes(type) ? pending : [...pending, type];
				return;
			}
			if (data.result === 'invalid') {
				error = data.error ?? 'Check the report and try again.';
				return;
			}
			toast.error('Could not send the report');
		} catch {
			toast.error('Could not send the report');
		} finally {
			submitting = false;
		}
	}
</script>

<button
	type="button"
	class={['flag', { page: placement === 'page' }]}
	aria-label="Report a problem with {restaurant.name}"
	onclick={open}
>
	<Flag size={14} aria-hidden="true" />
	Report a problem
</button>

{#if formOpen}
<dialog {@attach captureDialog} aria-labelledby={'report-problem-' + restaurant.slug} onclose={() => { formOpen = false; }} onclick={(event) => { if (event.target === dialogEl) close(); }}>
	<form onsubmit={submit}>
		<header>
			<h2 id={'report-problem-' + restaurant.slug}>Report a problem</h2>
			<p>{restaurant.name}</p>
			<p class="place">{placeLabel}</p>
		</header>

		<fieldset>
			<legend>What is wrong?</legend>
			{#each choices as choice (choice)}
				<label>
					<input type="radio" name="problem-type" value={choice} bind:group={type} />
					{REPORT_TYPE_LABELS[choice]}
				</label>
			{/each}
		</fieldset>

		{#if waiting}
			<p class="waiting" role="status">This report is already waiting for review.</p>
		{/if}

		{#if type === 'wrong_detail'}
			<label class="field">Name <input name="name" bind:value={name} maxlength="120" autocomplete="off" /></label>
			<label class="field">City <input name="city" bind:value={city} maxlength="80" autocomplete="off" /></label>
			<label class="field">Street <input name="street" bind:value={street} maxlength="160" autocomplete="off" /></label>
			<label class="field">Cuisine <input name="cuisine" bind:value={cuisine} maxlength="60" autocomplete="off" /></label>
			<label class="field">Map link <input name="maps" bind:value={mapsUrl} maxlength="500" inputmode="url" autocomplete="off" /></label>
		{:else if type === 'duplicate'}
			<p class="place">Pick the other listing. Places at the same spot are listed first.</p>
			<div class="search-row">
				<label class="field">Find a restaurant <input name="duplicate-search" bind:value={search} maxlength="80" autocomplete="off" /></label>
				<button type="button" class="secondary" onclick={findMatches}>Find</button>
			</div>
			{#if choicesToShow.length === 0}
				<p class="place">{searched ? 'No matching restaurants.' : 'No other restaurant is at this spot. Search by name.'}</p>
			{:else}
				<fieldset>
					<legend>Other restaurant</legend>
					{#each choicesToShow as choice (choice.slug)}
						<label>
							<input type="radio" name="duplicate-of" value={choice.slug} bind:group={duplicateSlug} />
							{choice.name}{choice.location ? ` · ${choice.location}` : ''}
						</label>
					{/each}
				</fieldset>
			{/if}
		{:else if type === 'moved'}
			<p class="place">Current city and street stay until you accept a replacement.</p>
			<label class="field">New city <input name="move-city" bind:value={moveCity} maxlength="80" autocomplete="off" /></label>
			<label class="field">New street <input name="move-street" bind:value={moveStreet} maxlength="160" autocomplete="off" /></label>
			<label class="field">Map link <input name="maps" bind:value={mapsUrl} maxlength="500" inputmode="url" autocomplete="off" /></label>
		{/if}

		{#if type}
			<label class="field">
				Note
				<textarea name="note" bind:value={note} maxlength="500" rows="3"></textarea>
			</label>
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<div class="dialog-actions">
			<button type="button" class="secondary" onclick={close}>Cancel</button>
			<button type="submit" disabled={!type || waiting || submitting || (type === 'duplicate' && !duplicateSlug)}>
				{submitting ? 'Sending' : 'Send report'}
			</button>
		</div>
	</form>
</dialog>
{/if}

<style>
	.flag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: inherit;
		font-size: 0.8rem;
		padding: 5px 14px;
		border-radius: 6px;
		cursor: pointer;
		border: 1px solid #d4c8bb;
		background: #fffcf8;
		color: #5d4e37;
		font-weight: 500;
		min-height: auto;
		box-sizing: border-box;
	}

	.flag.page {
		min-height: 44px;
		padding: 0.5rem 0.8rem;
		color: #a52e00;
		text-decoration: none;
	}

	@media (max-width: 1023px) {
		.flag:not(.page) {
			min-height: 44px;
			min-width: 44px;
			padding-top: 0;
			padding-bottom: 0;
		}
	}

	.flag:focus-visible,
	button:focus-visible,
	input:focus-visible,
	textarea:focus-visible {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	dialog {
		width: min(32rem, calc(100vw - 2rem));
		border: 1px solid #e2d9ce;
		border-radius: 12px;
		padding: 0;
		background: #fffdf9;
		color: #3e2c23;
	}

	dialog::backdrop { background: rgba(62, 44, 35, 0.45); }

	form { padding: 1.1rem 1.2rem 1.2rem; font-family: 'DM Sans', system-ui, sans-serif; }
	h2 { font-family: 'DM Serif Display', Georgia, serif; font-weight: 400; margin: 0 0 0.25rem; }
	.place, .waiting { color: #64594e; margin: 0.25rem 0 0.75rem; }
	fieldset { border: 1px solid #e2d9ce; border-radius: 8px; margin: 0.5rem 0 0.75rem; }
	label { display: flex; gap: 0.45rem; align-items: center; min-height: 44px; }
	.field { display: grid; gap: 0.25rem; align-items: stretch; margin: 0.5rem 0; }
	input, textarea {
		font: inherit;
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #d4c8bb;
		border-radius: 6px;
		padding: 0.45rem 0.6rem;
		background: #fff;
		color: inherit;
	}
	.search-row { display: flex; gap: 0.5rem; align-items: end; }
	.search-row .field { flex: 1; }
	.dialog-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; }
	button:not(.flag) {
		font: inherit;
		min-height: 44px;
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		border: 1px solid #c43700;
		background: #c43700;
		color: #fffdf9;
		cursor: pointer;
	}
	button.secondary, .flag { background: #fffcf8; color: #5d4e37; border-color: #d4c8bb; }
	button:disabled { opacity: 0.55; cursor: default; }
	.error { color: #8d1d18; }
</style>
