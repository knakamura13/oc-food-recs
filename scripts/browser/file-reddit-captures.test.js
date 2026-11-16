import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fileCaptures } from './file-reddit-captures.js';

const html = (id) => `<main id="main-content"><shreddit-post id="t3_${id}"></shreddit-post></main>`;
const meta = (id, fields = {}) => ({ status: 'captured', postId: id, subreddit: 'examplecity', commentCount: 3, expectedCommentCount: 3, url: `https://www.reddit.com/r/examplecity/comments/${id}/`, savedAt: '2026-10-06T05:00:00.000Z', ...fields });
const download = (fields, body) => `<!-- ocfr-capture ${JSON.stringify(fields)} -->\n${body}`;

let from;
let out;
beforeEach(async () => {
	from = await mkdtemp(path.join(tmpdir(), 'ocfr-downloads-'));
	out = await mkdtemp(path.join(tmpdir(), 'ocfr-captures-'));
});
const sidecar = async (id) => JSON.parse(await readFile(path.join(out, `examplecity-${id}.capture.json`), 'utf8'));

describe('fileCaptures', () => {
	it('files bare HTML with a digest sidecar and archives the download', async () => {
		await writeFile(path.join(from, 'examplecity-aaa111.html'), download(meta('aaa111', { status: 'shortfall' }), html('aaa111')));
		const { filed, rejected } = await fileCaptures({ from, out });
		expect(rejected).toEqual([]);
		expect(filed).toHaveLength(1);
		expect(await readFile(path.join(out, 'examplecity-aaa111.html'), 'utf8')).toBe(html('aaa111'));
		expect(await sidecar('aaa111')).toMatchObject({ status: 'shortfall', file: 'examplecity-aaa111.html', bytes: html('aaa111').length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
		expect(await readdir(from)).toEqual([]);
		expect(await readdir(path.join(out, 'downloads'))).toEqual([expect.stringMatching(/^\d+-examplecity-aaa111\.html$/)]);
	});

	it('leaves unrelated HTML and rejected captures in the downloads folder', async () => {
		await writeFile(path.join(from, 'receipt.html'), '<html>not ours</html>');
		await writeFile(path.join(from, 'examplecity-bbb222.html'), download(meta('bbb222'), html('zzz999')));
		await writeFile(path.join(from, 'examplecity-ccc333.html'), download(meta('ccc333', { status: 'incomplete' }), html('ccc333')));
		await writeFile(path.join(from, 'examplecity-ddd444.html'), download(meta('ddd444', { url: 'https://evil.example/' }), html('ddd444')));
		const { filed, rejected } = await fileCaptures({ from, out });
		expect(filed).toEqual([]);
		expect(rejected.map((entry) => [entry.file, entry.reason])).toEqual([
			['examplecity-bbb222.html', 'HTML does not contain the expected post'],
			['examplecity-ccc333.html', 'status incomplete is not a saved capture'],
			['examplecity-ddd444.html', 'unreadable metadata: Not a canonical Reddit thread URL: https://evil.example/']
		]);
		expect((await readdir(from)).sort()).toEqual(['examplecity-bbb222.html', 'examplecity-ccc333.html', 'examplecity-ddd444.html', 'receipt.html']);
	});

	it('keeps the newest of repeated downloads', async () => {
		await writeFile(path.join(from, 'examplecity-aaa111.html'), download(meta('aaa111', { commentCount: 2 }), html('aaa111')));
		await writeFile(path.join(from, 'examplecity-aaa111 (1).html'), download(meta('aaa111', { commentCount: 3, savedAt: '2026-10-06T06:00:00.000Z' }), html('aaa111')));
		await fileCaptures({ from, out });
		expect(await sidecar('aaa111')).toMatchObject({ commentCount: 3 });
		expect(await readdir(path.join(out, 'downloads'))).toHaveLength(2);
	});
});
