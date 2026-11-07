import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportProblem from './ReportProblem.svelte';

const mocks = vi.hoisted(() => ({
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	toastInfo: vi.fn(),
}));

vi.mock('$lib/toast', () => ({
	toast: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
		info: mocks.toastInfo,
	},
}));

const restaurant = {
	slug: 'la-taco-spot',
	name: 'La Taco Spot',
	location: 'Santa Ana',
	street: '1 Main St',
	cuisine: 'Mexican',
};

describe('ReportProblem', () => {
	beforeEach(() => {
		mocks.toastError.mockReset();
		mocks.toastSuccess.mockReset();
		mocks.toastInfo.mockReset();
	});

	it('files a chain report for this restaurant and keeps the note', async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (!init) return { ok: true, status: 200, json: async () => ({ result: 'ok', pending: [] }) };
			return { ok: true, status: 200, json: async () => ({ result: 'filed' }) };
		});
		vi.stubGlobal('fetch', fetchMock);
		render(ReportProblem, { restaurant });
		await user.click(screen.getByRole('button', { name: /report a problem with la taco spot/i }));
		await user.click(await screen.findByRole('radio', { name: 'Chain' }));
		await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Lots of locations');
		await user.click(screen.getByRole('button', { name: 'Send report' }));
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/r/la-taco-spot/reports',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ type: 'chain', note: 'Lots of locations' }),
			})
		);
		expect(mocks.toastSuccess).toHaveBeenCalledWith('Report sent. It stays private until it is reviewed.');
	});

	it('does not send a second report of a type that is already waiting', async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ result: 'ok', pending: ['closed'] }),
		}));
		vi.stubGlobal('fetch', fetchMock);
		render(ReportProblem, { restaurant });
		await user.click(screen.getByRole('button', { name: /report a problem with la taco spot/i }));
		await user.click(await screen.findByRole('radio', { name: 'Closed' }));
		expect(await screen.findByRole('status')).toHaveTextContent('already waiting');
		expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
