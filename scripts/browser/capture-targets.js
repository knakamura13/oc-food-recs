/**
 * Shared Node helpers for one-click capture: canonical thread targets from the
 * local queue, and the capture files under output/ingestion/captures.
 */
import { readFile, rename, writeFile } from 'node:fs/promises';

const THREAD_URL = /^https:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/([A-Za-z0-9_]{2,32})\/comments\/([A-Za-z0-9]{3,12})(?:\/[^?#]*)?(?:[?#].*)?$/;
export const SAVED = new Set(['captured', 'shortfall']);

export function threadTarget(url) {
	const match = THREAD_URL.exec(url ?? '');
	if (!match) throw new Error(`Not a canonical Reddit thread URL: ${url}`);
	const [subreddit, postId] = [match[1].toLowerCase(), match[2].toLowerCase()];
	return { postId, subreddit, name: `${subreddit}-${postId}`, url: `https://www.reddit.com/r/${subreddit}/comments/${postId}/` };
}

// Queue records come from scripts/ingest_queue.py; only queued/failed work without a capture is eligible.
export function eligibleTargets(records) {
	const targets = new Map();
	for (const record of records) {
		if (!['queued', 'failed'].includes(record.state) || record.capture_present === true) continue;
		const target = threadTarget(record.url);
		if (target.postId !== record.post_id) throw new Error(`Queue record ${record.post_id} does not match its URL`);
		targets.set(target.postId, target);
	}
	return [...targets.values()];
}

export async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		throw error;
	}
}

export async function writeAtomic(file, content) {
	const temporary = `${file}.${process.pid}.tmp`;
	await writeFile(temporary, content);
	await rename(temporary, file);
}
