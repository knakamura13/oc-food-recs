import { json } from '@sveltejs/kit';
import { allowRequest } from '$lib/server/rate-limit';
import { fileVisitorReport, loadReportForm } from '$lib/server/restaurants/visitor-reports';
import type { RequestHandler } from './$types';

const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 15 * 60 * 1000;
const NO_STORE = { 'cache-control': 'private, no-store' };

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

export const GET: RequestHandler = async ({ params, url }) => {
	const result = await loadReportForm(params.slug ?? '', url.searchParams.get('q'));
	if (result.result === 'not_found') return json(result, { status: 404, headers: NO_STORE });
	return json(result, { headers: NO_STORE });
};

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isAllowedOrigin(request)) return json({ result: 'forbidden' }, { status: 403, headers: NO_STORE });

	const ip = typeof getClientAddress === 'function' ? getClientAddress() : 'unknown';
	if (!allowRequest(`visitor-report:${ip}`, { limit: REPORT_LIMIT, windowMs: REPORT_WINDOW_MS })) {
		return json({ result: 'rate_limited' }, { status: 429, headers: NO_STORE });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ result: 'invalid', error: 'Report must be JSON.' }, { status: 400, headers: NO_STORE });
	}
	if (!body || typeof body !== 'object') {
		return json({ result: 'invalid', error: 'Report must be JSON.' }, { status: 400, headers: NO_STORE });
	}

	const record = body as Record<string, unknown>;
	const type = typeof record.type === 'string' ? record.type : '';
	const result = await fileVisitorReport(params.slug ?? '', type, record);
	if (result.result === 'not_found') return json(result, { status: 404, headers: NO_STORE });
	if (result.result === 'invalid') return json(result, { status: 400, headers: NO_STORE });
	if (result.result === 'already_pending') return json(result, { status: 409, headers: NO_STORE });
	return json(result, { headers: NO_STORE });
};
