import { EVENT_SPECS, type EventName } from '$lib/events';

export const MAX_EVENT_BODY_BYTES = 256;

export type ParsedEvent = { event: EventName; props: Record<string, string | boolean> };

/**
 * Validate a beacon body against the allowlist. Returns null for anything that is not exactly an
 * allowed event with allowed props (unknown event, unknown prop, off-list value, wrong shape).
 */
export function parseEventBody(text: string): ParsedEvent | null {
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
	const { event, props = {} } = body as { event?: unknown; props?: unknown };
	if (typeof event !== 'string' || !Object.hasOwn(EVENT_SPECS, event)) return null;
	if (typeof props !== 'object' || props === null || Array.isArray(props)) return null;

	const spec: Record<string, readonly (string | boolean)[]> = EVENT_SPECS[event as EventName];
	const entries = Object.entries(props);
	if (entries.length > Object.keys(spec).length) return null;
	for (const [key, value] of entries) {
		if (!Object.hasOwn(spec, key) || !spec[key].includes(value as string | boolean)) return null;
	}
	return { event: event as EventName, props: props as Record<string, string | boolean> };
}

/** Counting is opt-in per environment so dev, tests and previews never write rows. */
export function eventsEnabled(value: string | undefined): boolean {
	return value === '1' || value === 'true';
}
