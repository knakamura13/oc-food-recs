import { describe, expect, it } from 'vitest';
import { eligibleTargets, threadTarget } from './capture-targets.js';

const url = (id) => `https://www.reddit.com/r/examplecity/comments/${id}/`;

describe('threadTarget', () => {
	it('canonicalizes a pasted thread URL', () => {
		expect(threadTarget('https://www.reddit.com/r/Anaheim/comments/1nscrs9/best_pizza_in_anaheimoc/')).toEqual({
			postId: '1nscrs9', subreddit: 'anaheim', name: 'anaheim-1nscrs9', url: 'https://www.reddit.com/r/anaheim/comments/1nscrs9/'
		});
	});

	it.each(['https://evil.example/r/a/comments/abc123/', 'https://redd.it/abc123', 'http://www.reddit.com/r/ab/comments/abc123/'])('rejects %s', (bad) => {
		expect(() => threadTarget(bad)).toThrow(/canonical/);
	});
});

describe('eligibleTargets', () => {
	const record = (id, fields = {}) => ({ post_id: id, subreddit: 'examplecity', url: url(id), state: 'queued', capture_present: false, ...fields });

	it('keeps queued and failed work once, skipping terminal, running and captured records', () => {
		const targets = eligibleTargets([
			record('aaa111'), record('aaa111'), record('bbb222', { state: 'failed' }), record('ccc333', { state: 'skipped' }),
			record('ddd444', { state: 'running' }), record('eee555', { capture_present: true })
		]);
		expect(targets.map((target) => target.postId)).toEqual(['aaa111', 'bbb222']);
	});

	it('refuses a record whose URL names another post', () => {
		expect(() => eligibleTargets([record('aaa111', { url: url('zzz999') })])).toThrow(/does not match/);
	});
});
