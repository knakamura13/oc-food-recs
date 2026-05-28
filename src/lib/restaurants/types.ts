export interface Mention {
	comment_id: string;
	thread_id: string;
	permalink: string | null;
	author: string;
	body: string;
	score: number;
	role: 'primary' | 'endorsement';
	classification: 'dish_rec' | 'personal_story' | 'endorsement' | 'filler' | 'question' | null;
}

export interface Restaurant {
	name: string;
	slug: string;
	location: string | null;
	cuisine: string | null;
	aggregate_score: number;
	mention_count: number;
	lat: number | null;
	lng: number | null;
	mentions: Mention[];
	source_threads: string[];
}

export interface ThreadSummary {
	id: string;
	title: string;
	url: string;
	subreddit: string;
	post_id: string;
	comment_count: number;
	restaurant_count: number;
}

export interface RestaurantData {
	restaurants: Restaurant[];
	meta: {
		source_threads: ThreadSummary[];
		total_restaurants: number;
		total_comments_processed: number;
		model_used: string;
		generated_at: string;
		kept_endorsement_types: string[];
		geocoded_count: number;
		unmapped_count: number;
	};
}

export type SortKey = 'score' | 'name' | null;
export type SortDirection = 'asc' | 'desc';
