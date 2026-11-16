import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { captureRedditThread } from './capture-reddit-thread.js';

function fixture(content = '', expectedCount = '1', url = 'https://www.reddit.com/r/Anaheim/comments/1nscrs9/best_pizza/') {
	const dom = new JSDOM(`<main id="main-content"><shreddit-post id="t3_1nscrs9" comment-count="${expectedCount}" subreddit-name="Anaheim"></shreddit-post><shreddit-comment-tree>${content}</shreddit-comment-tree></main>`, { url });
	dom.window.scrollTo = () => {};
	return dom;
}

const comment = (id) => `<shreddit-comment thingid="t1_${id}"><div slot="comment">Pizza</div></shreddit-comment>`;
const options = (dom, overrides = {}) => ({
	window: dom.window,
	expectedPostId: '1nscrs9',
	expectedSubreddit: 'Anaheim',
	sleep: async () => {},
	...overrides
});

describe('captureRedditThread', () => {
	it('captures a stable full thread without clipboard or downloads', async () => {
		const dom = fixture(comment('a'));
		const result = await captureRedditThread(options(dom));
		expect(result).toMatchObject({ status: 'captured', postId: '1nscrs9', subreddit: 'anaheim', commentCount: 1, expectedCommentCount: 1, rounds: 3 });
		expect(result.html).toContain('id="main-content"');
	});

	it('waits for dynamic nested comments and newly inserted expanders', async () => {
		const dom = fixture(`${comment('a')}<button><faceplate-tracker noun="more_replies"></faceplate-tracker></button>`, '3');
		const tree = dom.window.document.querySelector('shreddit-comment-tree');
		let waits = 0;
		tree.querySelector('button').onclick = (event) => {
			event.currentTarget.remove();
			tree.insertAdjacentHTML('beforeend', `${comment('b')}<faceplate-partial src="/more-comments"><button>View more</button></faceplate-partial>`);
			tree.querySelector('button').onclick = () => {
				tree.querySelector('faceplate-partial').remove();
				tree.insertAdjacentHTML('beforeend', comment('c'));
			};
		};
		const result = await captureRedditThread(options(dom, { sleep: async () => { waits++; } }));
		expect(result.status).toBe('captured');
		expect(result.commentCount).toBe(3);
		expect(result.rounds).toBe(5);
		expect(waits).toBe(6);
	});

	it('does not call a stuck clicked button complete', async () => {
		const dom = fixture(`${comment('a')}<button><faceplate-tracker noun="more_replies"></faceplate-tracker></button>`);
		let clicks = 0;
		dom.window.document.querySelector('button').onclick = () => clicks++;
		const result = await captureRedditThread(options(dom, { maxRounds: 8 }));
		expect(result.status).toBe('incomplete');
		expect(result.reason).toMatch(/unresolved/i);
		expect(clicks).toBe(1);
	});

	it('fails closed at the round cap', async () => {
		const dom = fixture(comment('a'));
		let number = 0;
		const result = await captureRedditThread(options(dom, {
			maxRounds: 2,
			sleep: async () => dom.window.document.querySelector('shreddit-comment-tree').insertAdjacentHTML('beforeend', comment(`b${number++}`))
		}));
		expect(result.status).toBe('incomplete');
		expect(result.reason).toMatch(/round cap/i);
	});

	it.each([
		['expected post', { expectedPostId: 'other' }],
		['expected subreddit', { expectedSubreddit: 'irvine' }]
	])('rejects a mismatched %s', async (_, overrides) => {
		const result = await captureRedditThread(options(fixture(comment('a')), overrides));
		expect(result.status).toBe('incomplete');
		expect(result.reason).toMatch(/identity/i);
	});

	it.each(['#main-content', 'shreddit-post', 'shreddit-comment-tree'])('refuses missing required structure %s', async (selector) => {
		const dom = fixture(comment('a'));
		dom.window.document.querySelector(selector).remove();
		expect((await captureRedditThread(options(dom))).status).toBe('incomplete');
	});

	it.each([
		'https://example.org/r/Anaheim/comments/1nscrs9/title/',
		'https://www.reddit.com/r/Anaheim/comments/1nscrs9/title/abc/',
		'https://www.reddit.com/r/Anaheim/comments/1nscrs9/title/?comment=abc',
		'https://www.reddit.com/r/Anaheim/comments/1nscrs9/title/?depth=1'
	])('refuses unsupported or limited URLs %s', async (url) => {
		expect((await captureRedditThread(options(fixture(comment('a'), '1', url)))).status).toBe('incomplete');
	});

	it('rejects a comment-tree focused on one comment', async () => {
		const dom = fixture(comment('a'));
		dom.window.document.querySelector('shreddit-comment-tree').setAttribute('comment-id', 't1_a');
		expect((await captureRedditThread(options(dom))).reason).toMatch(/limited/i);
	});

	it('ignores an aria-hidden loading duplicate while clicking its visible sibling', async () => {
		const dom = fixture(`${comment('a')}<faceplate-partial src="/more-comments"><button aria-hidden="true">Duplicate</button><button>View more comments</button></faceplate-partial>`, '2');
		const buttons = dom.window.document.querySelectorAll('button');
		buttons[0].onclick = () => { throw new Error('Clicked duplicate'); };
		buttons[1].onclick = () => {
			dom.window.document.querySelector('faceplate-partial').remove();
			dom.window.document.querySelector('shreddit-comment-tree').insertAdjacentHTML('beforeend', comment('b'));
		};
		const result = await captureRedditThread(options(dom));
		expect(result.status).toBe('captured');
		expect(result.commentCount).toBe(2);
	});

	it('ignores hover-card placeholder spinners inside comments', async () => {
		const card = '<rpl-hovercard><div slot="content"><faceplate-partial src="/svc/shreddit/user-hover-card/x" loading="programmatic"><div><faceplate-progress value="20" status="loading"></faceplate-progress></div></faceplate-partial></div></rpl-hovercard>';
		const result = await captureRedditThread(options(fixture(`<shreddit-comment thingid="t1_a">${card}</shreddit-comment>`)));
		expect(result.status).toBe('captured');
	});

	it.each(['<shreddit-comment-tree-more></shreddit-comment-tree-more>', '<div class="morecomments"></div>', '<div aria-busy="true"></div>', '<faceplate-progress></faceplate-progress>'])('refuses unresolved structural markers %s', async (marker) => {
		const result = await captureRedditThread(options(fixture(comment('a') + marker), { maxRounds: 5 }));
		expect(result.status).toBe('incomplete');
	});

	it('refuses an empty snapshot when the post advertises comments', async () => {
		const result = await captureRedditThread(options(fixture('', '53')));
		expect(result.status).toBe('incomplete');
		expect(result.reason).toMatch(/zero comments/i);
	});

	it('blocks positive count shortfalls without claiming missing comments are retrievable', async () => {
		const result = await captureRedditThread(options(fixture(comment('a'), '53')));
		expect(result).toMatchObject({ status: 'incomplete', html: null, commentCount: 1, expectedCommentCount: 53 });
		expect(result.reason).toMatch(/shortfall/);
	});

	it('keeps a settled small shortfall for review without labeling it captured', async () => {
		const comments = Array.from({ length: 50 }, (_, index) => comment(`c${index}`)).join('');
		const result = await captureRedditThread(options(fixture(comments, '53')));
		expect(result).toMatchObject({ status: 'shortfall', commentCount: 50, expectedCommentCount: 53 });
		expect(result.html).toContain('id="main-content"');
	});

	it('ignores programmatic partials outside the comment tree', async () => {
		const dom = fixture(comment('a'));
		dom.window.document.querySelector('#main-content').insertAdjacentHTML('beforeend', '<faceplate-partial name="DevvitPrivacyModal_x" src="/svc/shreddit/devvit-privacy-modal/:subredditId" loading="programmatic"></faceplate-partial>');
		expect((await captureRedditThread(options(dom))).status).toBe('captured');
	});

	it('reports an unloaded comment partial as the blocker', async () => {
		const dom = fixture(`${comment('a')}<faceplate-partial src="/svc/shreddit/more-comments/Anaheim/t3_1nscrs9" loading="programmatic"></faceplate-partial>`, '2');
		const result = await captureRedditThread(options(dom, { maxRounds: 5 }));
		expect(result.status).toBe('incomplete');
		expect(result.blockers).toEqual([{ tag: 'faceplate-partial', name: null, label: null, src: '/svc/shreddit/more-comments/Anaheim/t3_1nscrs9', inCommentTree: true }]);
	});

	it('ignores a CSS-hidden Loading duplicate without clicking it', async () => {
		const dom = fixture(`${comment('a')}<faceplate-partial src="/more-comments"><button aria-label="Loading" style="display:none">Loading</button><button>View more</button></faceplate-partial>`, '2');
		const buttons = dom.window.document.querySelectorAll('button');
		buttons[0].onclick = () => { throw new Error('Clicked loading'); };
		buttons[1].onclick = () => {
			dom.window.document.querySelector('faceplate-partial').remove();
			dom.window.document.querySelector('shreddit-comment-tree').insertAdjacentHTML('beforeend', comment('b'));
		};
		expect((await captureRedditThread(options(dom))).status).toBe('captured');
	});

	it('reports unavailable counts honestly and deduplicates comment identities', async () => {
		const result = await captureRedditThread(options(fixture(comment('a') + comment('a'), 'unknown')));
		expect(result).toMatchObject({ status: 'captured', expectedCommentCount: null, commentCount: 1 });
	});

	it('rejects invalid timing options before touching the page', async () => {
		await expect(captureRedditThread(options(fixture(), { maxRounds: 0 }))).rejects.toThrow(/maxRounds/);
	});
});
