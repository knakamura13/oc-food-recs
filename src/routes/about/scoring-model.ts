import { REPEAT_AUTHOR_DECAY, VOICE_SHRINK_PRIOR } from '$lib/restaurants/stores.svelte';

/**
 * The scoring explanation shown on /about, kept in one place so it is easy to update when the
 * ranking model changes. It must describe `aggregate_score` / `mention_count` as computed by the
 * `published_mentions`, `comment_spread` and `ranked_mentions` CTEs in `src/routes/+page.server.ts`
 * and `aggregateRestaurant` in `src/lib/restaurants/stores.svelte.ts`.
 */
function decayLabel(rank: number): string {
	const factor = REPEAT_AUTHOR_DECAY ** rank;
	if (factor === 0.5) return '½';
	if (factor === 0.25) return '¼';
	return `${Math.round(factor * 100)}%`;
}

export const SCORING_PARAGRAPHS = [
	'Each recommendation is a Reddit comment, and its points are the comment’s upvotes. A comment counts when it is the one that brought the restaurant up, or when its text actually names the restaurant. A reply that only says “agreed!” under someone else’s pick adds nothing.',
	'A comment that names several restaurants is a list, not several full endorsements: its upvotes are split evenly across the restaurants it names.',
	`So that one enthusiastic person cannot read as consensus, each commenter’s repeat recommendations of the same place are discounted: their best comment counts in full, the next at ${decayLabel(1)}, the next at ${decayLabel(2)}, and so on.`,
	`Finally the total is scaled by voices ÷ (voices + ${VOICE_SHRINK_PRIOR}), where “voices” is the number of distinct commenters (the “people” shown on each card). A place praised by one person is held back; the penalty fades as more people agree.`
];

export interface ScoringExample {
	lines: string[];
}

/** A worked example whose arithmetic is computed from the live constants. */
export function scoringExample(): ScoringExample {
	const first = 40;
	const second = 30;
	const other = 20;
	const voices = 2;
	const person = first + second * REPEAT_AUTHOR_DECAY;
	const raw = person + other;
	const factor = voices / (voices + VOICE_SHRINK_PRIOR);
	return {
		lines: [
			`One person recommends a place twice, in comments with ${first} and ${second} points (each naming only that place): ${first} + ${second} × ${REPEAT_AUTHOR_DECAY} = ${person}.`,
			`A second person adds a comment with ${other} points: ${person} + ${other} = ${raw}, from ${voices} voices. Scaled by ${voices} ÷ (${voices} + ${VOICE_SHRINK_PRIOR}), the score is ${Math.round(raw * factor)}.`
		]
	};
}
