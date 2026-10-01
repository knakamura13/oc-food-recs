export interface AboutThread {
	id: string;
	title: string;
	url: string;
	subreddit: string;
	commentCount: number;
}

export interface SubredditGroup {
	subreddit: string;
	threads: AboutThread[];
}

export interface Coverage {
	restaurants: number;
	quotes: number;
	redditors: number;
	threads: number;
	subreddits: number;
	commentsRead: number;
	withoutCoordinates: number;
	withoutCuisine: number;
	chainsExcluded: number;
	closedExcluded: number;
	/** ISO timestamp of the most recent thread snapshot; null when no thread is published. */
	snapshotAt: string | null;
}

/** Subreddits with the most threads first (then A to Z); threads inside by comment count. */
export function groupThreadsBySubreddit(threads: AboutThread[]): SubredditGroup[] {
	const groups = new Map<string, AboutThread[]>();
	for (const thread of threads) {
		const list = groups.get(thread.subreddit);
		if (list) list.push(thread);
		else groups.set(thread.subreddit, [thread]);
	}
	return [...groups.entries()]
		.map(([subreddit, list]) => ({
			subreddit,
			threads: [...list].sort(
				(a, b) => b.commentCount - a.commentCount || a.title.localeCompare(b.title)
			)
		}))
		.sort(
			(a, b) => b.threads.length - a.threads.length || a.subreddit.localeCompare(b.subreddit)
		);
}

/** Whole-number percentage of `part` in `whole`; 0 when `whole` is 0. */
export function percentOf(part: number, whole: number): number {
	return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
