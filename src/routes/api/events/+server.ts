import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { eventsEnabled, MAX_EVENT_BODY_BYTES, parseEventBody } from '$lib/server/events';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_EVENT_BODY_BYTES) return new Response(null, { status: 413 });
	const text = await request.text();
	if (Buffer.byteLength(text) > MAX_EVENT_BODY_BYTES) return new Response(null, { status: 413 });

	const parsed = parseEventBody(text);
	if (!parsed) return new Response(null, { status: 400 });

	// Only the event name and allowlisted props are stored: no IP, user agent or cookie.
	if (eventsEnabled(env.EVENTS_ENABLED)) {
		await db.insert(events).values({ event: parsed.event, props: parsed.props });
	}
	return new Response(null, { status: 204 });
};
