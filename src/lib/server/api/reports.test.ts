import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resetRateLimitForTests } from '$lib/server/rate-limit';

const fileMock = vi.fn();
const pendingMock = vi.fn();

vi.mock('$lib/server/restaurants/visitor-reports', () => ({
	fileVisitorReport: (...args: unknown[]) => fileMock(...args),
	loadReportForm: (...args: unknown[]) => pendingMock(...args),
}));

function event(overrides: Record<string, unknown> = {}) {
	return {
		params: { slug: 'habit' },
		url: new URL('http://localhost/api/r/habit/reports'),
		getClientAddress: () => '127.0.0.1',
		request: new Request('http://localhost/api/r/habit/reports', {
			method: 'POST',
			headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'chain', note: 'Many locations' }),
		}),
		...overrides,
	} as never;
}

describe('POST /api/r/[slug]/reports', () => {
	beforeEach(() => {
		fileMock.mockReset();
		pendingMock.mockReset();
		resetRateLimitForTests();
	});

	it('files a chain report', async () => {
		fileMock.mockResolvedValue({ result: 'filed' });
		const { POST } = await import('../../../routes/api/r/[slug]/reports/+server');
		const res = await POST(event());
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ result: 'filed' });
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(fileMock).toHaveBeenCalledWith('habit', 'chain', expect.objectContaining({ note: 'Many locations' }));
	});

	it('returns 404 when the restaurant is missing', async () => {
		fileMock.mockResolvedValue({ result: 'not_found' });
		const { POST } = await import('../../../routes/api/r/[slug]/reports/+server');
		const res = await POST(event());
		expect(res.status).toBe(404);
	});

	it('returns the validation error', async () => {
		fileMock.mockResolvedValue({ result: 'invalid', error: 'Change at least one detail.' });
		const { POST } = await import('../../../routes/api/r/[slug]/reports/+server');
		const res = await POST(event());
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ result: 'invalid', error: 'Change at least one detail.' });
	});

	it('returns 409 when that report is already waiting', async () => {
		fileMock.mockResolvedValue({ result: 'already_pending' });
		const { POST } = await import('../../../routes/api/r/[slug]/reports/+server');
		const res = await POST(event());
		expect(res.status).toBe(409);
	});

	it('rejects a cross-origin report', async () => {
		const { POST } = await import('../../../routes/api/r/[slug]/reports/+server');
		const res = await POST(
			event({
				request: new Request('http://localhost/api/r/habit/reports', {
					method: 'POST',
					headers: { host: 'localhost', origin: 'https://evil.example', 'content-type': 'application/json' },
					body: JSON.stringify({ type: 'chain' }),
				}),
			})
		);
		expect(res.status).toBe(403);
		expect(fileMock).not.toHaveBeenCalled();
	});

	it('rate-limits repeated reports from the same IP', async () => {
		fileMock.mockResolvedValue({ result: 'filed' });
		const { POST } = await import('../../../routes/api/r/[slug]/reports/+server');
		for (let i = 0; i < 5; i += 1) {
			expect((await POST(event())).status).toBe(200);
		}
		const limited = await POST(event());
		expect(limited.status).toBe(429);
		expect(fileMock).toHaveBeenCalledTimes(5);
	});
});

describe('GET /api/r/[slug]/reports', () => {
	beforeEach(() => {
		pendingMock.mockReset();
	});

	it('lists pending types without caching them', async () => {
		pendingMock.mockResolvedValue({ result: 'ok', pending: ['closed'], nearby: [], matches: [] });
		const { GET } = await import('../../../routes/api/r/[slug]/reports/+server');
		const res = await GET(event());
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ result: 'ok', pending: ['closed'], nearby: [], matches: [] });
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(pendingMock).toHaveBeenCalledWith('habit', null);
	});
});
