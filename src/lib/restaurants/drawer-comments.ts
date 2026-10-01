import type { Mention } from './types';

/** Every primary comment, strongest first (ties by comment id for a stable order). */
export function primaryMentions(mentions: Mention[]): Mention[] {
	return mentions
		.filter((m) => m.role === 'primary')
		.sort((a, b) => b.score - a.score || a.comment_id.localeCompare(b.comment_id));
}

export function primaryThreadCount(primaries: Mention[]): number {
	return new Set(primaries.map((m) => m.thread_id)).size;
}
