import { tokenizeCommentBody } from './comment-body';

export interface PublicEvidence {
	thread_id: string;
	comment_id: string;
	body: string;
	comment_date: string | Date | null;
	co_mentions?: number;
	body_restaurants?: number;
}

/** Same plain representation as the safe comment renderer; never returns HTML. */
export function excerptBody(body: string): { body: string; is_excerpt: boolean } {
	const text = tokenizeCommentBody(body).map(paragraph => paragraph.map(token =>
		token.type === 'break' ? '\n' : token.text).join('')).join('\n\n').trim();
	if (Array.from(text).length < 400) return { body: text, is_excerpt: false };
	const prefix = Array.from(text).slice(0, 300).join('');
	const boundary = prefix.search(/\s+\S*$/u);
	return { body: `${(boundary > 0 ? prefix.slice(0, boundary) : prefix).trimEnd()}…`, is_excerpt: true };
}

export function validCoordinates(lat: number | null, lng: number | null): boolean {
	return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) &&
		Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function publicIndexability(lat: number | null, lng: number | null, evidence: PublicEvidence[]) {
	const comments = new Map<string, PublicEvidence>();
	for (const mention of evidence) comments.set(JSON.stringify([mention.thread_id, mention.comment_id]), mention);
	const bodies = new Set<string>();
	let unique_word_count = 0;
	let latest: number | null = null;
	for (const mention of comments.values()) {
		const date = mention.comment_date === null ? NaN : new Date(mention.comment_date).getTime();
		if (Number.isFinite(date) && (latest === null || date > latest)) latest = date;
		const body = excerptBody(mention.body).body;
		const key = body.normalize('NFKC').replace(/\s+/gu, ' ').trim();
		if ((mention.co_mentions ?? 1) > 1 || (mention.body_restaurants ?? 1) > 1 || bodies.has(key)) continue;
		bodies.add(key);
		unique_word_count += key.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
	}
	return {
		mention_count: comments.size,
		thread_count: new Set([...comments.values()].map(m => m.thread_id)).size,
		unique_word_count,
		indexable: validCoordinates(lat, lng) && comments.size >= 2 && unique_word_count >= 50,
		lastmod: latest === null ? null : new Date(latest).toISOString()
	};
}
