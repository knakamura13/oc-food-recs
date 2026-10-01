import { beforeEach, describe, expect, it, vi } from 'vitest';

const valuesMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn(() => ({ values: valuesMock }));
const envMock: { EVENTS_ENABLED?: string } = {};

vi.mock('$lib/server/db', () => ({ db: { insert: insertMock } }));
vi.mock('$env/dynamic/private', () => ({ env: envMock }));

function post(body: unknown) {
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return {
		request: new Request('http://localhost/api/events', { method: 'POST', body: text })
	} as never;
}

describe('POST /api/events', () => {
	beforeEach(() => {
		insertMock.mockClear();
		valuesMock.mockClear();
		delete envMock.EVENTS_ENABLED;
	});

	it('writes nothing while EVENTS_ENABLED is unset', async () => {
		const { POST } = await import('../../../routes/api/events/+server');
		const res = await POST(post({ event: 'card_expanded' }));
		expect(res.status).toBe(204);
		expect(insertMock).not.toHaveBeenCalled();
	});

	it('stores only the event name and its allowlisted props when enabled', async () => {
		envMock.EVENTS_ENABLED = '1';
		const { POST } = await import('../../../routes/api/events/+server');
		const res = await POST(post({ event: 'share_clicked', props: { surface: 'card' } }));
		expect(res.status).toBe(204);
		expect(valuesMock).toHaveBeenCalledWith({ event: 'share_clicked', props: { surface: 'card' } });
	});

	it('rejects an unknown event name with 400, enabled or not', async () => {
		const { POST } = await import('../../../routes/api/events/+server');
		expect((await POST(post({ event: 'page_view' }))).status).toBe(400);
		envMock.EVENTS_ENABLED = '1';
		expect((await POST(post({ event: 'page_view' }))).status).toBe(400);
		expect(insertMock).not.toHaveBeenCalled();
	});

	it('rejects props that could carry free text or identifiers', async () => {
		envMock.EVENTS_ENABLED = '1';
		const { POST } = await import('../../../routes/api/events/+server');
		for (const body of [
			{ event: 'search_submitted', props: { query: 'pho' } },
			{ event: 'search_submitted', props: { zero_results: 'pho' } },
			{ event: 'card_expanded', props: { slug: 'habit' } },
			{ event: 'filter_applied', props: { kind: 'cuisine', extra: true } },
			{ event: 'filter_applied', props: ['cuisine'] },
			'not json'
		]) {
			expect((await POST(post(body))).status).toBe(400);
		}
		expect(insertMock).not.toHaveBeenCalled();
	});

	it('caps the payload size', async () => {
		envMock.EVENTS_ENABLED = '1';
		const { POST } = await import('../../../routes/api/events/+server');
		const big = { event: 'card_expanded', props: {}, pad: 'x'.repeat(1000) };
		expect((await POST(post(big))).status).toBe(413);
		expect(insertMock).not.toHaveBeenCalled();
	});
});
