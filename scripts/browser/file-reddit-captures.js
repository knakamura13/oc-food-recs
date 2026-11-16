#!/usr/bin/env node
/**
 * Files one-click capture downloads: for each `<subreddit>-<postId>.html` in the
 * downloads folder that starts with an `ocfr-capture` comment, checks its identity
 * and status, writes the bare #main-content HTML plus a `.capture.json` sidecar
 * (status, counts, blockers, sha256) to output/ingestion/captures, and moves the
 * original download into captures/downloads. Other files are left alone.
 * A filed capture is not ingestion: publish with `ingest --html` and verify first.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { SAVED, readJson, threadTarget, writeAtomic } from './capture-targets.js';

const HEADER = /^<!-- ocfr-capture (\{.*\}) -->\n/;

async function move(from, to) {
	try {
		await rename(from, to);
	} catch (error) {
		if (error.code !== 'EXDEV') throw error;
		await copyFile(from, to);
		await unlink(from);
	}
}

function check(meta, html) {
	if (!SAVED.has(meta.status)) return `status ${meta.status} is not a saved capture`;
	const target = threadTarget(meta.url);
	if (target.postId !== meta.postId || target.subreddit !== meta.subreddit) return 'metadata identity does not match its URL';
	if (!html.includes('id="main-content"')) return 'missing #main-content';
	if (!new RegExp(`\\bt3_${target.postId}\\b`, 'i').test(html)) return 'HTML does not contain the expected post';
	return null;
}

export async function fileCaptures({ from, out, log = () => {} }) {
	const archive = path.join(out, 'downloads');
	await mkdir(archive, { recursive: true });
	const filed = [];
	const rejected = [];
	for (const entry of (await readdir(from)).filter((name) => name.endsWith('.html')).sort()) {
		const source = path.join(from, entry);
		const text = await readFile(source, 'utf8');
		const match = HEADER.exec(text);
		if (!match) continue;
		const html = text.slice(match[0].length);
		let meta;
		let problem;
		try {
			meta = JSON.parse(match[1]);
			problem = check(meta, html);
		} catch (error) {
			problem = `unreadable metadata: ${error.message}`;
		}
		if (problem) {
			rejected.push({ file: entry, reason: problem });
			log(`${entry}: left in place (${problem})`);
			continue;
		}
		const target = threadTarget(meta.url);
		const sidecar = path.join(out, `${target.name}.capture.json`);
		const existing = await readJson(sidecar);
		// Chrome names repeat downloads "name (1).html"; keep the newest save.
		if (!(existing?.savedAt > meta.savedAt)) {
			await writeAtomic(path.join(out, `${target.name}.html`), html);
			const record = { ...meta, file: `${target.name}.html`, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), filedAt: new Date().toISOString() };
			await writeAtomic(sidecar, `${JSON.stringify(record, null, '\t')}\n`);
			filed.push(record);
			log(`${target.name}: ${meta.status} (${meta.commentCount} of ${meta.expectedCommentCount ?? '?'} comments)`);
		}
		await move(source, path.join(archive, `${Date.now()}-${entry}`));
	}
	return { filed, rejected };
}

async function main(argv) {
	const { values } = parseArgs({
		args: argv,
		options: {
			from: { type: 'string', default: path.join(os.homedir(), 'Downloads') },
			out: { type: 'string', default: 'output/ingestion/captures' }
		}
	});
	const { filed, rejected } = await fileCaptures({ from: values.from, out: values.out, log: console.log });
	const counts = filed.reduce((all, record) => ({ ...all, [record.status]: (all[record.status] ?? 0) + 1 }), {});
	console.log(JSON.stringify({ filed: counts, rejected: rejected.length }));
	if (rejected.length) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
