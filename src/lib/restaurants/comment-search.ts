import { scheduleDebounced } from '$lib/debounce';

export interface CommentSearchHit {
	slug: string;
	rank: number;
	quote: string;
}

export function scheduleCommentSearch(
	query: string,
	onResult: (matches: CommentSearchHit[]) => void,
	onError: () => void,
	fetcher: typeof fetch = fetch
) {
	const controller = new AbortController();
	const cancel = scheduleDebounced(async () => {
		try {
			const response = await fetcher(`/api/search?q=${encodeURIComponent(query)}&limit=100`, {
				signal: controller.signal
			});
			if (!response.ok) throw new Error('Comment search failed');
			const matches: unknown = await response.json();
			if (!Array.isArray(matches) || matches.length > 100 || matches.some((hit) =>
				!hit || typeof hit.slug !== 'string' || typeof hit.quote !== 'string' ||
				typeof hit.rank !== 'number' || !Number.isFinite(hit.rank)
			)) throw new Error('Invalid comment search response');
			if (!controller.signal.aborted) onResult(matches);
		} catch {
			if (!controller.signal.aborted) onError();
		}
	});
	return () => {
		cancel();
		controller.abort();
	};
}
