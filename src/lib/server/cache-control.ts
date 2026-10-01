// Shared-cache policy for public, read-only responses (Railway CDN honours s-maxage).
// Keep the TTL short: production data edits must reach visitors within minutes.
// Browsers do not cache these (no max-age); purge the edge with `railway cdn purge html`.
export const PUBLIC_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600';
