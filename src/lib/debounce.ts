/** Shared delay for page-list search and map marker sync while typing. */
export const SEARCH_DEBOUNCE_MS = 175;

/** Schedule `callback` after `waitMs`. Returns a cancel function. */
export function scheduleDebounced(
	callback: () => void,
	waitMs: number = SEARCH_DEBOUNCE_MS,
): () => void {
	const timer = setTimeout(callback, waitMs);
	return () => clearTimeout(timer);
}
