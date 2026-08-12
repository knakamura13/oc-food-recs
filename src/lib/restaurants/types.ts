export interface Mention {
  comment_id: string;
  thread_id: string;
  permalink: string | null;
  author: string;
  body: string;
  score: number;
  role: "primary" | "endorsement";
  classification:
    | "dish_rec"
    | "personal_story"
    | "endorsement"
    | "filler"
    | "question"
    | null;
  /** ISO 8601 timestamp the Reddit comment was authored, or null for legacy rows without a source date. */
  comment_date: string | null;
}

/** The subset of Mention fields shipped in the page payload; the rest load on demand. */
export type ListMention = Pick<
  Mention,
  "comment_date" | "thread_id" | "score" | "author" | "role"
>;

export interface Restaurant {
  name: string;
  slug: string;
  location: string | null;
  cuisine: string | null;
  aggregate_score: number;
  mention_count: number;
  /** Count of mentions with role === 'endorsement' for the current mention slice. */
  endorsement_count: number;
  /** Count of dish_rec endorsements (from published mentions). */
  dish_rec_count: number;
  /** Best published comment body for the collapsed teaser, if any. */
  top_comment_snippet: string | null;
  lat: number | null;
  lng: number | null;
  mentions: ListMention[];
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
    total_comments_processed: number;
  };
}

export type SortKey = "score" | "recency" | "name" | null;
export type SortDirection = "asc" | "desc";
