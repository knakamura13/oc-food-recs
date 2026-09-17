import { json } from '@sveltejs/kit';
import { reportRestaurantAsChain } from '$lib/server/restaurants/admin';
import { allowRequest } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const REPORT_CHAIN_LIMIT = 5;
const REPORT_CHAIN_WINDOW_MS = 15 * 60 * 1000;

function isAllowedOrigin(request: Request | undefined): boolean {
	if (!request) return true;
	const origin = request.headers.get('origin');
	const host = request.headers.get('host');
	if (!origin || !host) return true;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

export const POST: RequestHandler = async ({ params, getClientAddress, request }) => {
	if (!isAllowedOrigin(request)) {
		return json({ result: 'forbidden' }, { status: 403 });
	}

	const ip = typeof getClientAddress === 'function' ? getClientAddress() : 'unknown';
	if (
		!allowRequest(`report-chain:${ip}`, {
			limit: REPORT_CHAIN_LIMIT,
			windowMs: REPORT_CHAIN_WINDOW_MS
		})
	) {
		return json({ result: 'rate_limited' }, { status: 429 });
	}

	const result = await reportRestaurantAsChain(params.slug ?? '');
	if (result === 'not_found') {
		return json({ result }, { status: 404 });
	}
	return json({ result });
};
