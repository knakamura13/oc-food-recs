import { REPEAT_AUTHOR_DECAY } from '$lib/restaurants/stores.svelte';

/**
 * The scoring explanation shown on /about, kept in one place so it is easy to update when the
 * ranking model changes. It must describe `aggregate_score` / `mention_count` as computed by the
 * `published_mentions` + `ranked_mentions` CTEs in `src/routes/+page.server.ts` and
 * `aggregateRestaurant` in `src/lib/restaurants/stores.svelte.ts`.
 */
export const SCORING_PARAGRAPHS = [
	'Each recommendation is a Reddit comment, and its points are the comment’s upvotes. A restaurant’s score is the sum of the points on the comments that recommend it.',
	'A comment counts when it is the one that brought the restaurant up, or when its text actually names the restaurant. A reply that only says “agreed!” under someone else’s pick does not add to the score.',
	`So that one enthusiastic person cannot read as consensus, each commenter’s repeat recommendations of the same place are discounted: their best comment counts in full, the next at ${decayLabel(1)}, the next at ${decayLabel(2)}, and so on. “Mentions” counts distinct commenters, not comments.`
];

function decayLabel(rank: number): string {
	const factor = REPEAT_AUTHOR_DECAY ** rank;
	if (factor === 0.5) return '½';
	if (factor === 0.25) return '¼';
	return `${Math.round(factor * 100)}%`;
}

export interface ScoringExample {
	lines: string[];
}

/** A worked example whose arithmetic is computed from the live decay factor. */
export function scoringExample(): ScoringExample {
	const first = 40;
	const second = 30;
	const other = 20;
	const repeat = second * REPEAT_AUTHOR_DECAY;
	const person = first + repeat;
	const total = Math.round(person + other);
	return {
		lines: [
			`One person recommends a place twice, in comments with ${first} and ${second} points: ${first} + ${second} × ${REPEAT_AUTHOR_DECAY} = ${person}.`,
			`A second person adds a comment with ${other} points. The restaurant scores ${person} + ${other} = ${total}, from 2 mentions (people), not 3.`
		]
	};
}
