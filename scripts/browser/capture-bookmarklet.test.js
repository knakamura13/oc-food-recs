import { Blob } from 'node:buffer';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { bookmarkletHref, installPage, oneClickCapture } from './capture-bookmarklet.js';
import { threadTarget } from './capture-targets.js';

const targets = ['aaa111', 'bbb222', 'ccc333'].map((id) => threadTarget(`https://www.reddit.com/r/examplecity/comments/${id}/`));
const key = 'ocfr-capture-test';
const saved = (status = 'captured') => ({ status, postId: 'aaa111', subreddit: 'examplecity', commentCount: 3, expectedCommentCount: 3, rounds: 4, reason: null, blockers: [], html: '<main id="main-content">thread -- body</main>' });

function fakePage(pathname, stored = {}, confirmAnswer = true) {
	const dom = new JSDOM('<body></body>', { url: `https://www.reddit.com${pathname}` });
	const downloads = [];
	dom.window.HTMLAnchorElement.prototype.click = function () {
		downloads.push({ name: this.download, blob: blobs.get(this.href) });
	};
	const blobs = new Map();
	const store = new Map([[key, JSON.stringify(stored)]]);
	const page = {
		document: dom.window.document,
		Blob,
		URL: { createObjectURL: (blob) => { const href = `blob:${blobs.size}`; blobs.set(href, blob); return href; }, revokeObjectURL: vi.fn() },
		location: { pathname, assign: vi.fn() },
		localStorage: { getItem: (name) => store.get(name) ?? null, setItem: (name, value) => store.set(name, value) },
		setTimeout: (fn) => fn(),
		alert: vi.fn(),
		confirm: vi.fn(() => confirmAnswer)
	};
	return { page, downloads, state: () => JSON.parse(store.get(key)) };
}

describe('oneClickCapture', () => {
	it('opens the first pending thread from any other Reddit page', async () => {
		const { page } = fakePage('/r/examplecity/', { aaa111: 'saved' });
		const capture = vi.fn();
		await oneClickCapture(capture, targets, key, page);
		expect(capture).not.toHaveBeenCalled();
		expect(page.location.assign).toHaveBeenCalledWith(targets[1].url);
	});

	it('downloads a saved capture with its metadata comment, then opens the next thread', async () => {
		const { page, downloads, state } = fakePage('/r/ExampleCity/comments/aaa111/some_title/');
		const capture = vi.fn(async () => saved('shortfall'));
		expect(await oneClickCapture(capture, targets, key, page)).toBe('shortfall');
		expect(capture).toHaveBeenCalledWith({ expectedPostId: 'aaa111', expectedSubreddit: 'examplecity' });
		expect(downloads.map((download) => download.name)).toEqual(['examplecity-aaa111.html']);
		const text = await downloads[0].blob.text();
		const [, header, html] = /^<!-- ocfr-capture (\{.*\}) -->\n([\s\S]*)$/.exec(text);
		expect(header).not.toContain('--');
		expect(JSON.parse(header)).toMatchObject({ status: 'shortfall', postId: 'aaa111', url: targets[0].url, savedAt: expect.any(String) });
		expect(JSON.parse(header).html).toBeUndefined();
		expect(html).toBe('<main id="main-content">thread -- body</main>');
		expect(state()).toEqual({ aaa111: 'saved' });
		expect(page.location.assign).toHaveBeenCalledWith(targets[1].url);
	});

	it('explains an unsaved thread and skips it only when asked', async () => {
		const blockers = [{ tag: 'faceplate-partial', src: '/svc/shreddit/more-comments/x', inCommentTree: true }];
		const incomplete = { ...saved(), status: 'incomplete', reason: 'Unresolved comment expander or loading marker', blockers, html: null };
		const stay = fakePage('/r/examplecity/comments/aaa111/', {}, false);
		await oneClickCapture(async () => incomplete, targets, key, stay.page);
		expect(stay.page.confirm.mock.calls[0][0]).toContain('faceplate-partial /svc/shreddit/more-comments/x (in comments)');
		expect(stay.downloads).toEqual([]);
		expect(stay.page.location.assign).not.toHaveBeenCalled();
		const skip = fakePage('/r/examplecity/comments/aaa111/');
		await oneClickCapture(async () => incomplete, targets, key, skip.page);
		expect(skip.state()).toEqual({ aaa111: 'skipped' });
		expect(skip.page.location.assign).toHaveBeenCalledWith(targets[1].url);
	});

	it('says when nothing is left', async () => {
		const { page } = fakePage('/r/examplecity/comments/ccc333/', { aaa111: 'saved', bbb222: 'skipped' });
		await oneClickCapture(async () => saved(), targets, key, page);
		expect(page.location.assign).not.toHaveBeenCalled();
		expect(page.alert).toHaveBeenCalledWith(expect.stringContaining('no pending threads'));
	});
});

describe('bookmarkletHref', () => {
	it('is a javascript: URL whose source parses and inlines the helper and targets', () => {
		const href = bookmarkletHref(targets, key);
		expect(href.startsWith('javascript:')).toBe(true);
		const source = decodeURIComponent(href.slice('javascript:'.length));
		expect(() => new Function(source)).not.toThrow();
		expect(source).toContain('captureRedditThread');
		expect(source).toContain(targets[2].url);
	});

	it('is embedded in the install page without breaking the attribute', () => {
		const html = installPage(targets, key);
		const link = new JSDOM(html).window.document.querySelector('a');
		expect(link.getAttribute('href')).toBe(bookmarkletHref(targets, key));
		expect(link.textContent).toBe('OCFR capture (3)');
	});
});
