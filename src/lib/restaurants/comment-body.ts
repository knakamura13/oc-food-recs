export type BodyToken =
	| { type: 'text'; text: string }
	| { type: 'bold'; text: string }
	| { type: 'link'; text: string; href: string }
	| { type: 'break' };

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const URL_RE = /https?:\/\/[^\s)<]+/g;
const BULLET_RE = /^\s*[-*]\s+/;

function hostLabel(href: string): string | null {
	try {
		return new URL(href).hostname.replace(/^www\./, '');
	} catch {
		return null;
	}
}

type Match = { start: number; end: number; token: BodyToken };

function collect(line: string): Match[] {
	const found: Match[] = [];
	for (const m of line.matchAll(LINK_RE)) {
		found.push({
			start: m.index,
			end: m.index + m[0].length,
			token: { type: 'link', text: m[1], href: m[2] }
		});
	}
	for (const m of line.matchAll(BOLD_RE)) {
		found.push({
			start: m.index,
			end: m.index + m[0].length,
			token: { type: 'bold', text: m[1] }
		});
	}
	for (const m of line.matchAll(URL_RE)) {
		const label = hostLabel(m[0]);
		found.push({
			start: m.index,
			end: m.index + m[0].length,
			token: label
				? { type: 'link', text: label, href: m[0] }
				: { type: 'text', text: m[0] }
		});
	}
	found.sort((a, b) => a.start - b.start || b.end - a.end);
	const kept: Match[] = [];
	let cursor = 0;
	for (const m of found) {
		if (m.start < cursor) continue;
		kept.push(m);
		cursor = m.end;
	}
	return kept;
}

function tokenizeLine(rawLine: string): BodyToken[] {
	const line = rawLine.replace(BULLET_RE, '');
	const tokens: BodyToken[] = [];
	if (line !== rawLine) tokens.push({ type: 'text', text: '• ' });
	let pos = 0;
	for (const m of collect(line)) {
		if (m.start > pos) tokens.push({ type: 'text', text: line.slice(pos, m.start) });
		tokens.push(m.token);
		pos = m.end;
	}
	if (pos < line.length) tokens.push({ type: 'text', text: line.slice(pos) });
	return tokens;
}

/** Splits a comment body into paragraphs of inline tokens. Never produces HTML. */
export function tokenizeCommentBody(body: string): BodyToken[][] {
	return body
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((paragraph) => {
			const tokens: BodyToken[] = [];
			paragraph.split('\n').forEach((line, i) => {
				if (i > 0) tokens.push({ type: 'break' });
				tokens.push(...tokenizeLine(line));
			});
			return tokens;
		});
}

/** Plain-text form of a body for teasers: links become labels, URLs and markers are dropped. */
export function stripMarkdownForSnippet(body: string): string {
	return body
		.replace(LINK_RE, '$1')
		.replace(URL_RE, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/^[ \t]*[-*][ \t]+/gm, '')
		.replace(/[ \t]{2,}/g, ' ');
}
