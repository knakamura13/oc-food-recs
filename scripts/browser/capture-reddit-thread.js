/**
 * Reusable version of Kyle Nakamura's Reddit expander, supplied 2026-10-05.
 * Execute in the currently loaded thread; no network, clipboard, or downloads.
 * The function is self-contained so a browser runner can inject its source.
 * `captured` means the visible full-thread DOM settled without known expanders;
 * it cannot certify comments Reddit omitted or deleted. Keep the count report.
 * `shortfall` means the same settled DOM is a few comments under the advertised
 * count (see SHORTFALL_TOLERANCE); it is kept for review, never labeled complete.
 */
export async function captureRedditThread(options = {}) {
	// Kept inside the function so the injected source stays self-contained.
	// Archived manual exports were short by at most 5 comments (19 of 87 threads).
	const SHORTFALL_TOLERANCE = { comments: 5, fraction: 0.05 };
	const page = options.window ?? window;
	const doc = page.document;
	const sleep = options.sleep ?? ((ms) => new Promise((resolve) => page.setTimeout(resolve, ms)));
	const settleMs = options.settleMs ?? 1200;
	const maxRounds = options.maxRounds ?? 300;
	const stableTarget = options.stableTarget ?? 3;
	for (const [name, value, minimum] of [
		['settleMs', settleMs, 0], ['maxRounds', maxRounds, 1], ['stableTarget', stableTarget, 1]
	]) {
		if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${name}`);
	}
	const result = {
		html: null, postId: null, subreddit: null, commentCount: 0,
		expectedCommentCount: null, rounds: 0, status: 'incomplete', reason: null, blockers: []
	};
	const refuse = (reason) => ({ ...result, reason });
	const url = new URL(page.location.href);
	if (url.protocol !== 'https:' || !['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(url.hostname) || url.port) {
		return refuse('Unsupported Reddit thread URL');
	}
	const parts = url.pathname.split('/').filter(Boolean);
	if (parts[0]?.toLowerCase() !== 'r' || parts[2]?.toLowerCase() !== 'comments' || !/^[a-z0-9]+$/i.test(parts[3] ?? '')) {
		return refuse('Missing full-thread URL identity');
	}
	if (parts.length > 5 || ['comment', 'depth', 'context'].some((key) => url.searchParams.has(key))) {
		return refuse('Limited comment URL cannot capture a full thread');
	}
	result.postId = parts[3].toLowerCase();
	result.subreddit = parts[1].toLowerCase();
	if (!options.expectedPostId || !options.expectedSubreddit ||
		String(options.expectedPostId).replace(/^t3_/, '').toLowerCase() !== result.postId ||
		String(options.expectedSubreddit).replace(/^\/?r\//i, '').toLowerCase() !== result.subreddit) {
		return refuse('Expected thread identity does not match URL');
	}
	const main = doc.querySelector('#main-content');
	const posts = main?.querySelectorAll('shreddit-post');
	if (!main || posts?.length !== 1) return refuse('Missing main content or unique Reddit post');
	const post = posts[0];
	const postIds = ['id', 'post-id', 'thingid'].map((name) => post.getAttribute(name)).filter((value) => /^t3_[a-z0-9]+$/i.test(value ?? ''));
	if (postIds.length === 0 || postIds.some((id) => id.toLowerCase() !== `t3_${result.postId}`)) return refuse('DOM post identity does not match URL');
	for (const name of ['subreddit-name', 'subreddit-prefixed-name']) {
		const sub = post.getAttribute(name);
		if (sub && sub.replace(/^\/?r\//i, '').toLowerCase() !== result.subreddit) return refuse('DOM subreddit identity does not match URL');
	}
	const tree = main.querySelector('shreddit-comment-tree');
	if (!tree) return refuse('Missing Reddit comment tree');
	if (['comment-id', 'root-comment-id', 'focused-comment-id'].some((name) => tree.hasAttribute(name))) {
		return refuse('Limited comment tree cannot capture a full thread');
	}
	const rawCount = post.getAttribute('comment-count');
	if (/^\d+$/.test(rawCount ?? '') && Number.isSafeInteger(Number(rawCount))) result.expectedCommentCount = Number(rawCount);
	const visible = (element) => {
		for (let node = element; node && node !== main.parentElement; node = node.parentElement) {
			if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
			const style = page.getComputedStyle(node);
			if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return false;
		}
		// Real browsers report layout boxes; jsdom deliberately has no layout.
		if (doc.documentElement.getClientRects().length && !element.getClientRects().length) return false;
		return true;
	};
	const expanderSelectors = [
		'button:not([aria-hidden="true"]):has(faceplate-tracker[noun*="more_replies"])',
		'button:not([aria-hidden="true"]):has(faceplate-tracker[noun*="more_comments"])',
		'faceplate-partial[src*="more-comments"] button:not([aria-hidden="true"])'
	];
	const expanders = () => [...new Set(expanderSelectors.flatMap((selector) => [...main.querySelectorAll(selector)]))].filter((button) => visible(button) && button.getAttribute('aria-label')?.toLowerCase() !== 'loading');
	const knownMore = () => main.querySelector('shreddit-comment-tree-more, shreddit-comment-tree-more-replies, .morecomments');
	// faceplate-partial's `loading` attribute is a load strategy ("programmatic" on all 8,685
	// partials in the archived exports, e.g. hover cards and the Devvit modal), not a busy state.
	// Every faceplate-progress in those exports is a hover-card placeholder, unrelated to comments.
	const loadingMarkers = () => [...main.querySelectorAll('[aria-busy="true"], faceplate-progress, button[aria-label="Loading"], faceplate-partial[src*="more-comments"], faceplate-partial[src*="more-replies"]')]
		.filter((element) => visible(element) && !element.closest('rpl-hovercard, faceplate-hovercard'));
	const loading = () => loadingMarkers().length > 0;
	const describe = (element) => ({
		tag: element.tagName.toLowerCase(), name: element.getAttribute('name'), label: element.getAttribute('aria-label'),
		src: element.getAttribute('src')?.slice(0, 120) ?? null, inCommentTree: tree.contains(element)
	});
	const unresolved = (reason) => ({ ...refuse(reason), blockers: [...new Set([...expanders(), knownMore(), ...loadingMarkers()].filter(Boolean))].slice(0, 10).map(describe) });
	const identitySet = () => new Set([...tree.querySelectorAll('shreddit-comment[thingid]')].map((node) => node.getAttribute('thingid')).filter((id) => /^t1_[a-z0-9]+$/i.test(id ?? '')));
	const sameIds = (before, after) => before.size === after.size && [...before].every((id) => after.has(id));
	const clicked = new WeakSet();
	let stable = 0;
	for (let round = 1; round <= maxRounds; round++) {
		result.rounds = round;
		const beforeHeight = doc.body.scrollHeight;
		const beforeIds = identitySet();
		page.scrollTo(0, beforeHeight);
		let expanded = 0;
		for (const button of expanders()) {
			if (!clicked.has(button) && !button.disabled) {
				clicked.add(button);
				button.click();
				expanded++;
			}
		}
		await sleep(settleMs);
		const afterIds = identitySet();
		result.commentCount = afterIds.size;
		const changed = beforeHeight !== doc.body.scrollHeight || !sameIds(beforeIds, afterIds) || expanded > 0;
		stable = changed ? 0 : stable + 1;
		if (stable < stableTarget) continue;
		if (expanders().length || knownMore() || loading()) return unresolved('Unresolved comment expander or loading marker');
		if (result.expectedCommentCount > 0 && result.commentCount === 0) return refuse('Post advertises comments but snapshot has zero comments');
		const missing = result.expectedCommentCount === null ? 0 : result.expectedCommentCount - result.commentCount;
		const shortfall = `captured ${result.commentCount} of ${result.expectedCommentCount} advertised; Reddit may include deleted or omitted comments`;
		if (missing > Math.max(SHORTFALL_TOLERANCE.comments, Math.floor(result.expectedCommentCount * SHORTFALL_TOLERANCE.fraction))) {
			return refuse(`Comment count shortfall: ${shortfall}`);
		}
		page.scrollTo(0, 0);
		await sleep(300);
		// Final settle can load another branch; recheck rather than exporting early.
		if (main !== doc.querySelector('#main-content') || !main.contains(post) || !main.contains(tree) || page.location.href !== url.href ||
			expanders().length || knownMore() || loading() || !sameIds(afterIds, identitySet())) {
			return unresolved('Thread changed during final settle');
		}
		if (missing > 0) return { ...result, html: main.outerHTML, status: 'shortfall', reason: `Settled with a small shortfall: ${shortfall}` };
		return { ...result, html: main.outerHTML, status: 'captured', reason: null };
	}
	return refuse('Round cap reached before thread settled');
}
