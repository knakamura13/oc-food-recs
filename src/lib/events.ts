/**
 * First-party interaction counter (#163). The allowlist below is the whole contract: the server
 * rejects any event or prop that is not listed, and no prop can carry free text, so a row can
 * never hold a search query, a restaurant name or anything else identifying. /about describes
 * exactly this list; keep the two in step.
 */
export const EVENT_SPECS = {
	search_submitted: { zero_results: [true, false] },
	filter_applied: {
		kind: [
			'cuisine',
			'city',
			'subreddit',
			'recency',
			'mom_and_pop',
			'saved',
			'unmapped',
			'new_since_visit',
			'search_suggestion'
		]
	},
	card_expanded: {},
	map_opened: {},
	restaurant_saved: {},
	share_clicked: { surface: ['view', 'card'] },
	maps_clicked: {}
} as const satisfies Record<string, Record<string, readonly (string | boolean)[]>>;

export type EventName = keyof typeof EVENT_SPECS;
export type EventProps<E extends EventName> = {
	[K in keyof (typeof EVENT_SPECS)[E]]: (typeof EVENT_SPECS)[E][K] extends readonly (infer V)[]
		? V
		: never;
};

export const EVENTS_ENDPOINT = '/api/events';

/** Fire-and-forget. `sendBeacon` survives navigation (outbound Maps links) and adds no cookies. */
export function trackEvent<E extends EventName>(event: E, props?: EventProps<E>): void {
	if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
	try {
		navigator.sendBeacon(
			EVENTS_ENDPOINT,
			new Blob([JSON.stringify({ event, props: props ?? {} })], { type: 'application/json' })
		);
	} catch {
		// Counting is best-effort; it must never break the interaction that triggered it.
	}
}
