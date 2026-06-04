// Site-wide page options. The public site is prerendered into a static snapshot
// only for the Sites build (adapter-static, SITES_BUILD=1). The default Railway /
// adapter-node build keeps live per-request SSR, so data ingested via /admin shows
// up immediately and the build needs no DB connectivity. /admin opts out of
// prerendering (see admin/+layout.server.ts).
export const prerender = process.env.SITES_BUILD === '1';
