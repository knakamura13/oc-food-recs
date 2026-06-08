import {
	bigint,
	bigserial,
	boolean,
	index,
	integer,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * One row per Reddit thread we've ingested.
 * `id` is the deterministic `<subreddit>-<post_id>` string the Python pipeline already produces.
 */
export const threads = pgTable('threads', {
	id: text('id').primaryKey(),
	subreddit: text('subreddit').notNull(),
	postId: text('post_id').notNull(),
	url: text('url').notNull(),
	title: text('title').notNull(),
	commentCount: integer('comment_count').notNull(),
	maxDepth: integer('max_depth').notNull(),
	fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
	includedInPublish: boolean('included_in_publish').default(true).notNull(),
});

/**
 * One row per distinct restaurant. `slug` is the URL/DOM identifier — collision-safe
 * (see migration script + Python ingest for the `-2`/`-3` suffix logic).
 *
 * `aggregate_score` and `mention_count` are intentionally NOT stored here — they're
 * derived from `mentions` via SUM(score) / COUNT(*) in the page load query, which keeps
 * them from drifting out of sync as mentions are added/updated.
 */
export const restaurants = pgTable('restaurants', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	location: text('location'),
	cuisine: text('cuisine'),
	lat: real('lat'),
	lng: real('lng'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One row per Reddit comment that mentions a restaurant. `role='primary'` is the
 * root-level comment that first introduced the restaurant in this thread;
 * `role='endorsement'` is a reply that endorses it (with a classification).
 *
 * `permalink` is nullable because endorsements migrated from the pre-DB JSON dataset
 * never recorded a comment-level permalink — only fresh ingests via the new pipeline
 * will populate it for every row. Going forward all new rows have a real permalink.
 */
export const mentions = pgTable(
	'mentions',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		restaurantId: bigint('restaurant_id', { mode: 'number' })
			.notNull()
			.references(() => restaurants.id, { onDelete: 'cascade' }),
		threadId: text('thread_id')
			.notNull()
			.references(() => threads.id, { onDelete: 'cascade' }),
		commentId: text('comment_id').notNull(),
		permalink: text('permalink'),
		author: text('author').notNull(),
		body: text('body').notNull(),
		score: integer('score').notNull(),
		role: text('role').notNull(), // 'primary' | 'endorsement'
		classification: text('classification'), // 'dish_rec' | 'personal_story' | 'endorsement' | 'filler' | 'question' | NULL (primaries)
		commentDate: timestamp('comment_date', { withTimezone: true }), // when the Reddit comment was authored (NULL for legacy rows awaiting backfill)
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		// A single Reddit comment can mention multiple restaurants ("I love El Farolito AND
		// Tama Sushi"), so the natural key is (thread, comment, restaurant), not (thread, comment).
		// In the existing dataset 44 distinct primary comments introduce 137 restaurants between them.
		uniqueMention: uniqueIndex('mentions_thread_comment_restaurant_unique').on(
			table.threadId,
			table.commentId,
			table.restaurantId
		),
		restaurantIdx: index('mentions_restaurant_idx').on(table.restaurantId),
		threadIdx: index('mentions_thread_idx').on(table.threadId),
		// Supports per-user lookups across threads ("has this user recommended this before?").
		authorIdx: index('mentions_author_idx').on(table.author),
	})
);

/**
 * Geocode cache to avoid redundant API calls and handle "smart negative caching".
 * Stores both successful results and tracked failures with a retry-after timestamp.
 */
export const geocodeCache = pgTable(
	'geocode_cache',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		query: text('query').notNull(),
		provider: text('provider').notNull(), // 'google' | 'nominatim' | 'mapbox'
		lat: real('lat'),
		lng: real('lng'),
		detail: text('detail'), // raw display name or address string
		geocodedCity: text('geocoded_city'),
		retryAfter: timestamp('retry_after', { withTimezone: true }), // for negative caching
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		queryIdx: uniqueIndex('geocode_cache_query_unique').on(table.query),
	})
);

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
export type Mention = typeof mentions.$inferSelect;
export type NewMention = typeof mentions.$inferInsert;
export type GeocodeCache = typeof geocodeCache.$inferSelect;
export type NewGeocodeCache = typeof geocodeCache.$inferInsert;
