import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleCommentSearch } from './comment-search';
import { SEARCH_DEBOUNCE_MS } from '$lib/debounce';

describe('comment search request lifecycle', () => {
	afterEach(() => vi.useRealTimers());
	it('waits for the existing debounce and passes an abort signal', async () => {
		vi.useFakeTimers();
		const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ slug: 'one', rank: 1, quote: 'patio' }] });
		const result = vi.fn();
		scheduleCommentSearch('patio', result, vi.fn(), fetcher);
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
		expect(fetcher).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(fetcher).toHaveBeenCalledWith('/api/search?q=patio&limit=100', { signal: expect.any(AbortSignal) });
		expect(result).toHaveBeenCalledWith([{ slug: 'one', rank: 1, quote: 'patio' }]);
	});

	it('cancels pending keystrokes and ignores an already in-flight stale response', async () => {
		vi.useFakeTimers();
		let resolve!: (value: unknown) => void;
		const fetcher = vi.fn().mockImplementation(() => new Promise((done) => { resolve = done; }));
		const result = vi.fn();
		const failure = vi.fn();
		const cancelPending = scheduleCommentSearch('old', result, failure, fetcher);
		cancelPending();
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(fetcher).not.toHaveBeenCalled();
		const cancelRunning = scheduleCommentSearch('new', result, failure, fetcher);
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		cancelRunning();
		expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
		resolve({ ok: true, json: async () => [{ slug: 'old', rank: 1, quote: 'stale' }] });
		await vi.runAllTimersAsync();
		expect(result).not.toHaveBeenCalled();
		expect(failure).not.toHaveBeenCalled();
	});

	it('reports failures without accepting malformed responses', async () => {
		vi.useFakeTimers();
		const result = vi.fn();
		const failure = vi.fn();
		scheduleCommentSearch('patio', result, failure, vi.fn().mockResolvedValue({ ok: true, json: async () => [{ slug: 'one', rank: 'bad', quote: 'patio' }] }));
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(result).not.toHaveBeenCalled();
		expect(failure).toHaveBeenCalledOnce();
	});
});
