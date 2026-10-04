import type { ChainConfidence } from "./mom-and-pop";

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
  /** Other restaurants named by the same comment (published, counting, not excluded). Absent on payloads that predate it. */
  other_places?: { slug: string; name: string }[];
}

/**
 * The subset of Mention fields shipped in the page payload; the rest load on demand.
 * `credit` is 1/n for a comment that names n restaurants, so a mention contributes
 * `score * credit`; it is computed server-side (comment_id isn't shipped) and
 * `weightedAggregates` multiplies by it.
 */
export type ListMention = Pick<
  Mention,
  "comment_date" | "thread_id" | "score" | "author" | "role"
> & { credit: number };

export interface Restaurant {
  name: string;
  slug: string;
  location: string | null;
  /** Street address (e.g. "1421 N El Camino Real"), or null when unknown. */
  street: string | null;
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
  /** Mom & pop policy v1 confidence. Missing/unknown still pass the default chip. */
  chain_confidence?: ChainConfidence;
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
    /** ISO timestamp of the newest published comment, or null when the dataset has no dated comments. */
    newest_comment_date: string | null;
  };
}

export type SortKey = "score" | "recency" | "name" | "relevance" | "distance";
export type SortDirection = "asc" | "desc";
