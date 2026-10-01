import { describe, expect, it } from 'vitest';
import { primaryMentions, primaryThreadCount } from './drawer-comments';
import type { Mention } from './types';

function m(id: string, thread: string, score: number, role: Mention['role'] = 'primary'): Mention {
	return {
		comment_id: id,
		thread_id: thread,
		permalink: null,
		author: 'a',
		body: 'b',
		score,
		role,
		classification: null,
		comment_date: null
	};
}

describe('drawer comments', () => {
	it('returns only primaries, strongest first, ties by comment id', () => {
		const out = primaryMentions([m('b', 't1', 5), m('e', 't1', 99, 'endorsement'), m('a', 't2', 5), m('c', 't2', 9)]);
		expect(out.map((x) => x.comment_id)).toEqual(['c', 'a', 'b']);
	});

	it('counts distinct threads', () => {
		expect(primaryThreadCount([m('a', 't1', 1), m('b', 't1', 1), m('c', 't2', 1)])).toBe(2);
	});
});
