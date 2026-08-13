<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { ListMention } from '$lib/restaurants/types';
	import {
		appState,
		buildDateHistogram,
		formatMonthYear,
		relativeAge,
		setFreshnessFilter
	} from '$lib/restaurants/stores.svelte';

	interface Props {
		/** Dated mentions for the current selection (already filtered by every OTHER filter). */
		mentions: ListMention[];
		/** Full-dataset comment-date range in epoch ms; the fixed slider/axis extent. */
		extent: { min: number; max: number };
	}

	let { mentions, extent }: Props = $props();

	const BIN_COUNT = 30;
	const DAY_MS = 86_400_000;
	const THROTTLE_MS = 100;
	const nowMs = Date.now();

	function clamp(v: number, lo: number, hi: number): number {
		return Math.min(Math.max(v, lo), hi);
	}

	// Handle position (instant visual feedback); the committed cutoff lives in appState.
	// Snapshot the initial value only — extent is the stable full-dataset range, and the $effect
	// below adopts any later external cutoff changes.
	let handleMs = $state(
		untrack(() => clamp(appState.freshnessCutoff ?? extent.min, extent.min, extent.max))
	);
	let dragging = $state(false);

	let span = $derived(extent.max - extent.min);
	let disabled = $derived(span <= 0 || mentions.length === 0);
	let bins = $derived(buildDateHistogram(mentions, extent, BIN_COUNT));
	let maxCount = $derived(Math.max(1, ...bins));
	let atAllTime = $derived(handleMs <= extent.min);
	let readout = $derived(
		atAllTime ? 'All time' : `Past ${relativeAge(handleMs, nowMs)} · since ${formatMonthYear(handleMs)}`
	);

	function binMidMs(i: number): number {
		return extent.min + ((i + 0.5) / BIN_COUNT) * span;
	}

	function barHeight(count: number): number {
		if (count === 0) return 0;
		return Math.max(8, (count / maxCount) * 100);
	}

	// Adopt external cutoff changes (URL load, pill-clear, Clear all) without clobbering an
	// in-progress drag. Depends only on freshnessCutoff + extent; handleMs is read/written untracked.
	$effect(() => {
		const target = clamp(appState.freshnessCutoff ?? extent.min, extent.min, extent.max);
		untrack(() => {
			if (!dragging && target !== handleMs) handleMs = target;
		});
	});

	let throttleTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingCommit = false;

	function commitNow() {
		setFreshnessFilter(handleMs <= extent.min ? null : handleMs);
	}

	// Leading + trailing throttle: commit immediately, then at most once per THROTTLE_MS while
	// the handle keeps moving, with a guaranteed final commit so the list always settles on the
	// released position.
	function scheduleCommit() {
		if (throttleTimer !== null) {
			pendingCommit = true;
			return;
		}
		commitNow();
		throttleTimer = setTimeout(function tick() {
			if (pendingCommit) {
				pendingCommit = false;
				commitNow();
				throttleTimer = setTimeout(tick, THROTTLE_MS);
			} else {
				throttleTimer = null;
			}
		}, THROTTLE_MS);
	}

	function flush() {
		if (throttleTimer !== null) {
			clearTimeout(throttleTimer);
			throttleTimer = null;
		}
		pendingCommit = false;
		commitNow();
	}

	function reset() {
		handleMs = extent.min;
		flush();
	}

	onDestroy(() => {
		if (throttleTimer !== null) clearTimeout(throttleTimer);
	});
</script>

<div class="recency">
	<div class="recency-title">Comment recency</div>

	{#if disabled}
		<p class="recency-empty">Not enough dated comments for this selection.</p>
	{:else}
		<div class="readout" aria-live="polite">{readout}</div>

		<div class="chart">
			<div class="bars" aria-hidden="true">
				{#each bins as count, i (i)}
					<div class="bar" class:dimmed={binMidMs(i) < handleMs} style="height: {barHeight(count)}%"></div>
				{/each}
			</div>
			<input
				class="slider"
				type="range"
				min={extent.min}
				max={extent.max}
				step={DAY_MS}
				bind:value={handleMs}
				oninput={scheduleCommit}
				onchange={flush}
				onpointerdown={() => (dragging = true)}
				onpointerup={() => {
					dragging = false;
					flush();
				}}
				aria-label="Show comments no older than"
				aria-valuetext={readout}
			/>
		</div>

		<div class="axis">
			<span>{formatMonthYear(extent.min)}</span>
			<span>{formatMonthYear(extent.max)}</span>
		</div>

		<div class="recency-actions">
			<button class="reset" onclick={reset} disabled={atAllTime}>Reset</button>
		</div>
	{/if}
</div>

<style>
	.recency {
		padding: 12px 14px;
		min-width: min(280px, calc(100vw - 2rem));
	}

	.recency-title {
		font-weight: 700;
		font-size: 0.95rem;
		color: #3e2c23;
		margin-bottom: 8px;
	}

	.recency-empty {
		font-size: 0.85rem;
		color: #7a6e63;
		margin: 0;
	}

	.readout {
		font-size: 0.85rem;
		font-weight: 600;
		color: #5d4e37;
		margin-bottom: 6px;
	}

	.chart {
		position: relative;
		height: 110px;
	}

	.bars {
		position: absolute;
		inset-block: 0 14px;
		inset-inline: 0;
		display: flex;
		align-items: flex-end;
		gap: 2px;
	}

	.bar {
		flex: 1;
		min-width: 0;
		background: #3e2c23;
		border-radius: 2px 2px 0 0;
		transition: background 0.1s ease;
	}

	.bar.dimmed {
		background: #ddd2c6;
	}

	.slider {
		position: absolute;
		inset-inline: 0;
		bottom: 0;
		width: 100%;
		height: 28px;
		margin: 0;
		padding: 0;
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		cursor: pointer;
	}

	.slider::-webkit-slider-runnable-track {
		height: 2px;
		background: #d4c8bb;
		border-radius: 2px;
	}

	.slider::-moz-range-track {
		height: 2px;
		background: #d4c8bb;
		border-radius: 2px;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #fff;
		border: 2px solid #ff4500;
		box-shadow: 0 1px 4px rgba(62, 44, 35, 0.3);
		margin-top: -13px;
		cursor: grab;
	}

	.slider::-moz-range-thumb {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #fff;
		border: 2px solid #ff4500;
		box-shadow: 0 1px 4px rgba(62, 44, 35, 0.3);
		cursor: grab;
	}

	.slider:focus-visible {
		outline: none;
	}

	.slider:focus-visible::-webkit-slider-thumb {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	.slider:focus-visible::-moz-range-thumb {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	.axis {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: #7a6e63;
		margin-top: 6px;
	}

	.recency-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 10px;
	}

	.reset {
		font-size: 0.8rem;
		padding: 4px 12px;
		border: 1px solid #d4c8bb;
		border-radius: 6px;
		background: #fffcf8;
		color: #5d4e37;
		cursor: pointer;
		font-weight: 500;
		transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
	}

	.reset:hover:not(:disabled) {
		border-color: #ff4500;
		color: #c43700;
	}

	.reset:active:not(:disabled) {
		transform: scale(0.97);
	}

	.reset:disabled {
		opacity: 0.5;
		cursor: default;
	}

	@media (prefers-reduced-motion: reduce) {
		.reset {
			transition: border-color 0.15s ease, color 0.15s ease;
		}

		.reset:active:not(:disabled) {
			transform: none;
		}
	}
</style>
