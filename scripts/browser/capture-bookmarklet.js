#!/usr/bin/env node
/**
 * One-click capture for the owner's everyday Chrome. Reddit blocks automated
 * browsers, so each capture is a bookmark click at the owner's own pace: it
 * expands the open thread with captureRedditThread, downloads
 * `<subreddit>-<postId>.html` (a metadata comment, then the same #main-content
 * HTML the original exporter saved) and opens the next pending thread.
 * file-reddit-captures.js then moves the downloads into output/ingestion/captures.
 *
 * This command only builds the bookmark: it writes a local page with a link to
 * drag onto the bookmarks bar. Rebuild after filing so the list stays current.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { captureRedditThread } from './capture-reddit-thread.js';
import { SAVED, eligibleTargets, readJson, threadTarget } from './capture-targets.js';

/**
 * Runs inside the Reddit tab, so it stays self-contained: the bookmark inlines its
 * source. Progress lives in this browser's localStorage under a per-build key; the
 * filed captures, not this state, are the record of what was saved.
 */
export async function oneClickCapture(capture, targets, key, page = window) {
	let state = {};
	try {
		state = JSON.parse(page.localStorage.getItem(key) ?? '{}');
	} catch {}
	const remember = (postId, outcome) => {
		state[postId] = outcome;
		try {
			page.localStorage.setItem(key, JSON.stringify(state));
		} catch {}
	};
	const here = /\/comments\/([a-z0-9]+)/i.exec(page.location.pathname)?.[1]?.toLowerCase();
	const pending = targets.filter((target) => !state[target.postId] && target.postId !== here);
	const openNext = () => {
		if (pending.length) page.location.assign(pending[0].url);
		else page.alert(`OC food recs: no pending threads left in this bookmark (${Object.keys(state).length} handled).`);
	};
	const target = targets.find((candidate) => candidate.postId === here);
	if (!target) return openNext();
	const result = await capture({ expectedPostId: target.postId, expectedSubreddit: target.subreddit });
	if (['captured', 'shortfall'].includes(result.status) && result.html) {
		const { html, ...metadata } = result;
		// A comment cannot contain "--"; the escape keeps the JSON valid.
		const header = JSON.stringify({ ...metadata, url: target.url, savedAt: new Date().toISOString() }).replace(/--/g, '-\\u002d');
		const link = page.document.createElement('a');
		link.href = page.URL.createObjectURL(new page.Blob([`<!-- ocfr-capture ${header} -->\n${html}`], { type: 'text/html' }));
		link.download = `${target.name}.html`;
		page.document.body.append(link);
		link.click();
		link.remove();
		remember(target.postId, 'saved');
		// Give the download a moment to start before leaving the page.
		page.setTimeout(() => {
			page.URL.revokeObjectURL(link.href);
			openNext();
		}, 1500);
		return result.status;
	}
	const blockers = (result.blockers ?? []).map((blocker) => `- ${blocker.tag}${blocker.src ? ` ${blocker.src}` : ''}${blocker.inCommentTree ? ' (in comments)' : ''}`).join('\n');
	if (page.confirm(`Not saved: ${result.reason}${blockers ? `\n${blockers}` : ''}\n\nOK skips to the next thread. Cancel stays here so you can click again.`)) {
		remember(target.postId, 'skipped');
		openNext();
	}
	return result.status;
}

export function bookmarkletHref(targets, key) {
	const source = `void (${oneClickCapture})(${captureRedditThread}, ${JSON.stringify(targets)}, ${JSON.stringify(key)})` +
		`.catch((error) => alert('OC food recs capture failed: ' + error.message))`;
	return `javascript:${encodeURIComponent(source)}`;
}

export function installPage(targets, key) {
	const href = bookmarkletHref(targets, key).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OCFR capture bookmark</title></head>
<body style="font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem;">
<h1>OC food recs capture</h1>
<p>Drag this link onto the bookmarks bar (replace any older copy): <a href="${href}">OCFR capture (${targets.length})</a></p>
<ol>
<li>Click it on any Reddit page to open the first pending thread.</li>
<li>Once the thread has loaded, click it again. It expands the comments, downloads the thread and opens the next one.</li>
<li>When you are done, run <code>npm run pipeline:file-captures</code> and rebuild this bookmark.</li>
</ol>
<p>Built ${key.replace('ocfr-capture-', '')} with ${targets.length} pending thread(s).</p>
</body>
</html>
`;
}

async function main(argv) {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			queue: { type: 'string', default: 'output/ingestion/queue.json' },
			captures: { type: 'string', default: 'output/ingestion/captures' },
			page: { type: 'string', default: 'output/ingestion/capture-bookmarklet.html' }
		}
	});
	let targets;
	if (positionals.length) {
		targets = [...new Map(positionals.map((url) => threadTarget(url)).map((target) => [target.postId, target])).values()];
	} else {
		const queue = await readJson(values.queue);
		if (!queue) throw new Error(`No queue at ${values.queue}; pass thread URLs or import the queue first`);
		targets = eligibleTargets(Object.values(queue.posts ?? {}));
	}
	const filed = await Promise.all(targets.map((target) => readJson(path.join(values.captures, `${target.name}.capture.json`))));
	targets = targets.filter((_, index) => !SAVED.has(filed[index]?.status));
	const key = `ocfr-capture-${new Date().toISOString().replace(/[:.]/g, '-')}`;
	await mkdir(path.dirname(values.page), { recursive: true });
	await writeFile(values.page, installPage(targets, key));
	console.log(`${targets.length} pending thread(s). Open ${path.resolve(values.page)} in Chrome and drag the link to the bookmarks bar.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
