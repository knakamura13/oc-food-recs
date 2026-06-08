import type { ListMention, Restaurant } from './types';
import { weightedAggregates } from './stores.svelte';

type SliceCache = Map<string, Restaurant>;

export function countEndorsements(mentions: ListMention[]): number {
	let n = 0;
	for (const m of mentions) {
		if (m.role === 'endorsement') n++;
	}
	return n;
}

function mentionIdentity(m: ListMention): string {
	return `${m.thread_id}|${m.author}|${m.score}|${m.role}|${m.comment_date ?? ''}`;
}

function restaurantMatchesSlice(r: Restaurant, kept: ListMention[]): boolean {
	if (r.mentions.length !== kept.length) return false;
	for (let i = 0; i < kept.length; i++) {
		if (mentionIdentity(r.mentions[i]) !== mentionIdentity(kept[i])) return false;
	}
	return true;
}

/** Slice a restaurant to a mention subset, reusing cached objects when the slice is unchanged. */
export function sliceRestaurantMentions(
	r: Restaurant,
	kept: ListMention[],
	cache: SliceCache,
	cacheKey: string
): Restaurant | null {
	if (kept.length === 0) return null;

	const cached = cache.get(cacheKey);
	if (cached && restaurantMatchesSlice(cached, kept)) {
		return cached;
	}

	const { aggregate_score, mention_count } = weightedAggregates(kept);
	const sliced: Restaurant = {
		...r,
		mentions: kept,
		mention_count,
		aggregate_score,
		endorsement_count: countEndorsements(kept),
		source_threads: [...new Set(kept.map((m) => m.thread_id))]
	};
	cache.set(cacheKey, sliced);
	return sliced;
}

export function createSliceCache(): SliceCache {
	return new Map();
}
