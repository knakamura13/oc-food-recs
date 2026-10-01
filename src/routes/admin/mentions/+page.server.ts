import { fail } from '@sveltejs/kit';
import {
	loadTakenDownMentions,
	restoreMention,
	searchMentionsForTakedown,
	takeDownMention
} from '$lib/server/restaurants/admin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	const [results, takenDown] = await Promise.all([
		searchMentionsForTakedown(q, 50),
		loadTakenDownMentions(200)
	]);
	return { q, results, takenDown };
};

function readIds(form: FormData): { threadId: string; commentId: string } | null {
	const threadId = String(form.get('threadId') ?? '').trim();
	const commentId = String(form.get('commentId') ?? '').trim();
	return threadId && commentId ? { threadId, commentId } : null;
}

function plural(count: number): string {
	return `${count} quote${count === 1 ? '' : 's'}`;
}

export const actions: Actions = {
	takeDown: async ({ request }) => {
		const ids = readIds(await request.formData());
		if (!ids) return fail(400, { error: 'Missing comment id.', action: 'takeDown' });
		try {
			const count = await takeDownMention(ids.threadId, ids.commentId);
			return {
				success: true,
				action: 'takeDown',
				message: `Took down ${plural(count)} from the public site.`
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Takedown failed.';
			return fail(400, { error: message, action: 'takeDown' });
		}
	},

	restore: async ({ request }) => {
		const ids = readIds(await request.formData());
		if (!ids) return fail(400, { error: 'Missing comment id.', action: 'restore' });
		try {
			const count = await restoreMention(ids.threadId, ids.commentId);
			return {
				success: true,
				action: 'restore',
				message: `Restored ${plural(count)} to the public site.`
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Restore failed.';
			return fail(400, { error: message, action: 'restore' });
		}
	}
};
