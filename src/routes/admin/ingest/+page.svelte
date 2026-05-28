<script lang="ts">
	import { onDestroy } from 'svelte';

	type Stage = 'parse' | 'extract' | 'geocode' | 'write' | 'done' | 'error' | 'log';

	interface ProgressEvent {
		stage: Stage | string;
		progress?: number;
		message?: string;
		level?: string;
		[key: string]: unknown;
	}

	let file = $state<File | null>(null);
	let events = $state<ProgressEvent[]>([]);
	let status = $state<'idle' | 'running' | 'done' | 'error'>('idle');
	let errorMessage = $state('');
	let controller = $state<AbortController | null>(null);
	let logEl = $state<HTMLDivElement | undefined>(undefined);

	const canSubmit = $derived(file !== null && status !== 'running');

	function fmtPercent(progress: number | undefined): string {
		if (progress === undefined || Number.isNaN(progress)) return '';
		const pct = Math.max(0, Math.min(1, progress)) * 100;
		return `${pct.toFixed(0)}%`;
	}

	function stageLabel(stage: string): string {
		switch (stage) {
			case 'parse':
				return 'Parse';
			case 'extract':
				return 'Extract';
			case 'geocode':
				return 'Geocode';
			case 'write':
				return 'Write';
			case 'done':
				return 'Done';
			case 'error':
				return 'Error';
			case 'log':
				return 'Log';
			default:
				return stage;
		}
	}

	function append(event: ProgressEvent) {
		events = [...events, event];
		// Scroll log to bottom on next tick
		queueMicrotask(() => {
			if (logEl) logEl.scrollTop = logEl.scrollHeight;
		});
	}

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		file = input.files?.[0] ?? null;
	}

	function handleEvent(parsed: ProgressEvent) {
		append(parsed);
		if (parsed.stage === 'done') {
			status = 'done';
		} else if (parsed.stage === 'error') {
			status = 'error';
			errorMessage = typeof parsed.message === 'string' ? parsed.message : 'Pipeline failed';
		}
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit || !file) return;

		// Reset state for a fresh run
		controller?.abort();
		events = [];
		errorMessage = '';
		status = 'running';

		const ac = new AbortController();
		controller = ac;
		const formData = new FormData();
		formData.append('html', file);

		try {
			const res = await fetch('/admin/ingest/stream', {
				method: 'POST',
				body: formData,
				signal: ac.signal
			});
			if (!res.ok || !res.body) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Request failed (${res.status})`);
			}

			// Server streams newline-delimited JSON progress events.
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						handleEvent(JSON.parse(trimmed));
					} catch {
						handleEvent({ stage: 'log', message: trimmed });
					}
				}
			}
			if (buffer.trim()) {
				try {
					handleEvent(JSON.parse(buffer.trim()));
				} catch {
					handleEvent({ stage: 'log', message: buffer.trim() });
				}
			}
			// Stream closed without an explicit done/error — treat as complete.
			if (status === 'running') status = 'done';
		} catch (err) {
			if (status === 'running') {
				status = 'error';
				errorMessage = err instanceof Error ? err.message : 'Ingest failed';
			}
		} finally {
			controller = null;
		}
	}

	onDestroy(() => {
		controller?.abort();
	});
</script>

<svelte:head>
	<title>Ingest Reddit Thread</title>
</svelte:head>

<main>
	<header>
		<h1>Ingest Reddit Thread</h1>
		<p class="subtitle">
			Upload a saved Reddit thread HTML file and watch the pipeline parse, extract, geocode, and write to the database. Export the thread from your browser (expand <em>load more comments</em> first for full coverage).
		</p>
	</header>

	<form onsubmit={handleSubmit}>
		<label for="thread-html">Reddit thread HTML file</label>
		<div class="input-row">
			<input
				id="thread-html"
				type="file"
				accept=".html,.htm,text/html"
				onchange={onFileChange}
				disabled={status === 'running'}
				required
			/>
			<button type="submit" disabled={!canSubmit}>
				{status === 'running' ? 'Running…' : 'Ingest'}
			</button>
		</div>
		{#if file}
			<p class="hint">Selected: <code>{file.name}</code> ({(file.size / 1024).toFixed(0)} KB)</p>
		{/if}
	</form>

	{#if events.length > 0}
		<section class="log-section" aria-label="Pipeline progress">
			<div class="log" bind:this={logEl} role="log" aria-live="polite">
				{#each events as event, i (i)}
					<div class="log-row" class:error={event.stage === 'error'} class:done={event.stage === 'done'} class:stderr={event.level === 'stderr'}>
						<span class="stage">{stageLabel(event.stage)}</span>
						{#if typeof event.progress === 'number'}
							<span class="progress">{fmtPercent(event.progress)}</span>
						{/if}
						<span class="message">{event.message ?? ''}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if status === 'done'}
		<section class="result success" role="status">
			<p>Pipeline complete.</p>
			<a class="primary-link" href="/">View site →</a>
		</section>
	{:else if status === 'error'}
		<section class="result error" role="alert">
			<p class="error-message">{errorMessage}</p>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 720px;
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

	.subtitle {
		color: #7a6e63;
		font-size: 0.95rem;
		line-height: 1.5;
		margin: 0;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	label {
		font-size: 0.85rem;
		font-weight: 500;
		color: #3e2c23;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.input-row {
		display: flex;
		gap: 0.5rem;
	}

	input[type='file'] {
		flex: 1;
		padding: 0.55rem 0.85rem;
		font-size: 0.9rem;
		font-family: inherit;
		border: 1px solid #d6cec5;
		border-radius: 8px;
		background: #fffdf9;
		color: #3e2c23;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	input[type='file']:focus {
		outline: none;
		border-color: #ff4500;
		box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.15);
	}

	input[type='file']:disabled {
		background: #f4efe9;
		cursor: not-allowed;
	}

	button {
		padding: 0.65rem 1.25rem;
		font-size: 0.95rem;
		font-family: inherit;
		font-weight: 600;
		border: none;
		border-radius: 8px;
		background: #ff4500;
		color: #fffdf9;
		cursor: pointer;
		transition: background-color 0.15s ease, transform 0.05s ease;
	}

	button:hover:not(:disabled) {
		background: #e63e00;
	}

	button:active:not(:disabled) {
		transform: translateY(1px);
	}

	button:disabled {
		background: #c9bfb4;
		cursor: not-allowed;
	}

	.hint {
		font-size: 0.8rem;
		color: #a8533d;
		margin: 0;
	}

	.hint code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
		background: rgba(255, 69, 0, 0.08);
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
	}

	.log-section {
		margin-bottom: 1.25rem;
	}

	.log {
		background: #fffdf9;
		border: 1px solid #e2d9ce;
		border-radius: 10px;
		padding: 0.75rem;
		max-height: 24rem;
		overflow-y: auto;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.82rem;
	}

	.log-row {
		display: grid;
		grid-template-columns: 5.5rem 3rem 1fr;
		gap: 0.75rem;
		padding: 0.3rem 0.4rem;
		border-radius: 4px;
		color: #3e2c23;
		line-height: 1.45;
	}

	.log-row + .log-row {
		margin-top: 0.1rem;
	}

	.log-row .stage {
		color: #7a6e63;
		font-weight: 600;
		text-transform: uppercase;
		font-size: 0.72rem;
		letter-spacing: 0.05em;
		align-self: center;
	}

	.log-row .progress {
		color: #ff4500;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: right;
		align-self: center;
	}

	.log-row .message {
		word-break: break-word;
	}

	.log-row.stderr {
		background: rgba(180, 130, 90, 0.08);
	}

	.log-row.stderr .stage {
		color: #b48a5a;
	}

	.log-row.done {
		background: rgba(38, 132, 64, 0.08);
	}

	.log-row.done .stage {
		color: #267d3d;
	}

	.log-row.error {
		background: rgba(200, 50, 50, 0.08);
	}

	.log-row.error .stage {
		color: #c83232;
	}

	.result {
		padding: 1rem 1.1rem;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.result p {
		margin: 0;
		font-size: 0.95rem;
	}

	.result.success {
		background: rgba(38, 132, 64, 0.08);
		border: 1px solid rgba(38, 132, 64, 0.25);
		color: #1e5e2f;
	}

	.result.error {
		background: rgba(200, 50, 50, 0.08);
		border: 1px solid rgba(200, 50, 50, 0.25);
	}

	.error-message {
		color: #a52121;
		font-weight: 500;
		word-break: break-word;
	}

	.primary-link {
		align-self: flex-start;
		color: #ff4500;
		text-decoration: underline;
		text-underline-offset: 2px;
		font-weight: 600;
	}

	.primary-link:hover {
		text-decoration-thickness: 2px;
	}

	@media (max-width: 640px) {
		main {
			padding: 1.5rem 1rem 2rem;
		}

		h1 {
			font-size: 1.4rem;
		}

		.input-row {
			flex-direction: column;
		}

		.log-row {
			grid-template-columns: 4.5rem 2.5rem 1fr;
			font-size: 0.78rem;
		}
	}
</style>
