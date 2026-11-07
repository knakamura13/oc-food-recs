import type { ChainConfidence } from './mom-and-pop';
import type { ListMention, Restaurant, RestaurantData } from './types';

/**
 * Compact transport for the home page dataset.
 *
 * Serialized as plain objects the dataset repeated every key name once per row
 * (about half the payload) and every thread id and author name once per mention.
 * The wire form sends one positional tuple per restaurant and a shared table for
 * thread ids and authors. `decodeRestaurants` rebuilds the exact `Restaurant`
 * objects the explorer already consumes, so nothing downstream changes.
 */
export interface WireRestaurants {
	/** Thread ids, referenced by index from restaurants and mentions. */
	t: string[];
	/** Author names, referenced by index from mentions. */
	a: string[];
	/** One tuple per restaurant; see `RestaurantTuple`. */
	r: RestaurantTuple[];
}

/** Mentions are flattened: [thread, author, score, role(0|1), date|null, credit] per mention. */
type RestaurantTuple = [
	name: string,
	slug: string,
	location: string | null,
	street: string | null,
	cuisine: string | null,
	lat: number | null,
	lng: number | null,
	aggregate_score: number,
	mention_count: number,
	dish_rec_count: number,
	top_comment_snippet: string | null,
	source_thread_indexes: number[],
	chain_confidence: number | null,
	mentions: (number | string | null)[],
	/** Only present for the rare restaurant with reviewed multiple locations. */
	extras?: Pick<Restaurant, 'location_scope' | 'reviewed_locations'>
];

const CONFIDENCE: (ChainConfidence | undefined)[] = [undefined, 'independent', 'likely_chain', 'unknown'];
const MENTION_STRIDE = 6;

export interface WireDataset extends Omit<RestaurantData, 'restaurants'> {
	restaurants: WireRestaurants;
}

function indexer(table: string[]) {
	const seen = new Map<string, number>();
	return (value: string): number => {
		let index = seen.get(value);
		if (index === undefined) {
			index = table.length;
			table.push(value);
			seen.set(value, index);
		}
		return index;
	};
}

export function encodeRestaurants(restaurants: Restaurant[]): WireRestaurants {
	const t: string[] = [];
	const a: string[] = [];
	const thread = indexer(t);
	const author = indexer(a);
	const r = restaurants.map((row): RestaurantTuple => {
		const mentions: (number | string | null)[] = [];
		for (const m of row.mentions) {
			mentions.push(thread(m.thread_id), author(m.author), m.score, m.role === 'endorsement' ? 1 : 0, m.comment_date, m.credit);
		}
		const tuple: RestaurantTuple = [
			row.name, row.slug, row.location, row.street, row.cuisine, row.lat, row.lng,
			row.aggregate_score, row.mention_count, row.dish_rec_count, row.top_comment_snippet,
			row.source_threads.map(thread),
			row.chain_confidence === undefined ? 0 : CONFIDENCE.indexOf(row.chain_confidence),
			mentions
		];
		if (row.location_scope || row.reviewed_locations) {
			tuple.push({ location_scope: row.location_scope, reviewed_locations: row.reviewed_locations });
		}
		return tuple;
	});
	return { t, a, r };
}

export function decodeRestaurants(wire: WireRestaurants): Restaurant[] {
	const { t, a } = wire;
	return wire.r.map((tuple): Restaurant => {
		const flat = tuple[13];
		const mentions: ListMention[] = [];
		let endorsements = 0;
		for (let i = 0; i < flat.length; i += MENTION_STRIDE) {
			const role = flat[i + 3] === 1 ? 'endorsement' : 'primary';
			if (role === 'endorsement') endorsements++;
			mentions.push({
				thread_id: t[flat[i] as number],
				author: a[flat[i + 1] as number],
				score: flat[i + 2] as number,
				role,
				comment_date: flat[i + 4] as string | null,
				credit: flat[i + 5] as number
			});
		}
		const restaurant: Restaurant = {
			name: tuple[0],
			slug: tuple[1],
			location: tuple[2],
			street: tuple[3],
			cuisine: tuple[4],
			lat: tuple[5],
			lng: tuple[6],
			aggregate_score: tuple[7],
			mention_count: tuple[8],
			endorsement_count: endorsements,
			dish_rec_count: tuple[9],
			top_comment_snippet: tuple[10],
			mentions,
			source_threads: tuple[11].map((index) => t[index]),
			chain_confidence: CONFIDENCE[tuple[12] ?? 0]
		};
		if (tuple[14]) Object.assign(restaurant, tuple[14]);
		return restaurant;
	});
}

/** Accepts either form so callers and tests that already hold decoded data keep working. */
export function decodeDataset(dataset: RestaurantData | WireDataset): RestaurantData {
	return Array.isArray(dataset.restaurants)
		? (dataset as RestaurantData)
		: { ...dataset, restaurants: decodeRestaurants(dataset.restaurants as WireRestaurants) };
}
