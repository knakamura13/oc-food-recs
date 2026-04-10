export interface Endorsement {
	type: 'dish_rec' | 'personal_story' | 'endorsement';
	author: string;
	body: string;
	score: number;
}

export interface PrimaryComment {
	id: string;
	author: string;
	body: string;
	score: number;
	permalink: string;
}

export interface Restaurant {
	name: string;
	location: string | null;
	cuisine: string | null;
	aggregate_score: number;
	mention_count: number;
	lat: number | null;
	lng: number | null;
	primary_comment: PrimaryComment;
	endorsements: Endorsement[];
}

export interface RestaurantData {
	restaurants: Restaurant[];
	meta: {
		source_thread: string;
		source_title: string;
		total_restaurants: number;
		total_comments_processed: number;
		extraction_date: string;
		geocoded_count: number;
		unmapped_count: number;
	};
}

export type SortKey = 'score' | 'name' | null;
export type SortDirection = 'asc' | 'desc';
