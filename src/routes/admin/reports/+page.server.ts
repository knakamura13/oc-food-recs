import { fail } from '@sveltejs/kit';
import { loadVisitorReportQueue, resolveVisitorReport } from '$lib/server/restaurants/visitor-reports';
import type { Actions, PageServerLoad } from './$types';

const FIELD_KEYS = ['name', 'location', 'street', 'cuisine', 'pin'] as const;

export const load: PageServerLoad = async () => loadVisitorReportQueue();

function reportId(form: FormData): number | null {
	const id = Number(form.get('reportId'));
	if (!Number.isInteger(id) || id <= 0) return null;
	return id;
}

function outcome(
	result: Awaited<ReturnType<typeof resolveVisitorReport>>,
	action: string
) {
	if (result.result === 'invalid') return fail(400, { error: result.error, action });
	if (result.result === 'not_found') return fail(404, { error: 'Report not found.', action });
	if (result.result === 'already_resolved') {
		return fail(409, { error: 'That report was already reviewed.', action });
	}
	return {
		success: true,
		action,
		message: result.result === 'accepted' ? 'Report accepted.' : 'Report dismissed. The restaurant is unchanged.',
	};
}

export const actions: Actions = {
	dismiss: async ({ request }) => {
		const id = reportId(await request.formData());
		if (id == null) return fail(400, { error: 'Invalid report.', action: 'dismiss' });
		return outcome(await resolveVisitorReport(id, { action: 'dismiss' }), 'dismiss');
	},

	accept: async ({ request }) => {
		const id = reportId(await request.formData());
		if (id == null) return fail(400, { error: 'Invalid report.', action: 'accept' });
		return outcome(await resolveVisitorReport(id, { action: 'accept' }), 'accept');
	},

	apply: async ({ request }) => {
		const form = await request.formData();
		const id = reportId(form);
		if (id == null) return fail(400, { error: 'Invalid report.', action: 'apply' });
		const fields: Record<string, unknown> = {};
		for (const key of FIELD_KEYS) {
			const value = form.get(key);
			if (typeof value === 'string') fields[key] = value;
		}
		return outcome(await resolveVisitorReport(id, { action: 'apply', fields }), 'apply');
	},

	merge: async ({ request }) => {
		const form = await request.formData();
		const id = reportId(form);
		if (id == null) return fail(400, { error: 'Invalid report.', action: 'merge' });
		const keep = form.get('keep');
		if (keep !== 'subject' && keep !== 'other') {
			return fail(400, { error: 'Choose which restaurant to keep.', action: 'merge' });
		}
		return outcome(await resolveVisitorReport(id, { action: 'merge', keep }), 'merge');
	},
};
