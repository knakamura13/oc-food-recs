export function sourceUrl(mention: { permalink: string | null; thread_id: string }): string | null {
	if (mention.permalink) {
		try {
			const url = new URL(mention.permalink, 'https://www.reddit.com');
			if (['https:', 'http:'].includes(url.protocol) && /(^|\.)reddit\.com$/.test(url.hostname)) return url.href;
		} catch { /* Fall back to an attributable source thread. */ }
	}
	const match = mention.thread_id.match(/^([A-Za-z0-9_]+)-([A-Za-z0-9]+)$/);
	return match ? `https://www.reddit.com/r/${match[1]}/comments/${match[2]}/` : null;
}
