# Issue #167 implementation and release checkpoint

## Delivery state

Implemented on `knakamura/167-public-pages`, stacked on #158 (`d0f1a16`, PR #226).
The primary checkout is preserved. Merge/deployment remains a separate authorization
boundary under the approved workday plan. Do not close #167 until deployed acceptance.

## Public contract

Standalone pages and comment search share restaurant visibility: exclude registry
`excluded` and `likely_chain`; unknown confidence remains public. Evidence requires a
published thread, published mention, and `countsTowardScore`. The interactive explorer
retains its existing optional Mom & pop filter; its full drawer bodies remain available
through the API, while standalone load data and JSON-LD contain only public excerpts.
Eager explorer metadata now excludes taken-down/non-naming evidence too.

Indexable restaurants require valid coordinates, two distinct `(thread_id, comment_id)`
comments and 50 words in visible excerpts. Shared multi-restaurant comments and repeated
bodies do not supply unique words. At 400 codepoints, plain comment text is shortened to
approximately 300 at a word boundary. Visible thin/unmapped pages are `noindex,follow`;
missing, hidden and evidence-empty restaurants are 404. Only verified merge-log aliases
to a visible winner redirect (308). No aliases are invented.

Hubs require five eligible restaurants across two source threads. Sparse recognized
categories remain useful noindex pages; unknown categories are 404. `/browse` supplies
crawlable links. Sitemap includes only eligible details/hubs and established root/about.
Root discovery is indexable; query variants are noindex and canonicalize to `/`.
Individual shares use `/r/<slug>`; filtered view shares remain explorer URLs.

Restaurant/Review/BreadcrumbList JSON-LD is escaped and uses displayed excerpts and
source identity only. Optional facts are omitted. There are no ratings, opening hours,
menu or current-price claims, and no promise of Google indexing or review stars.

## Moderation and cache

Takedown is scoped to `(thread_id, comment_id)` across all attached restaurants.
Ingestion now preserves removed rows as tombstones, retains their status on conflict,
and marks newly attached copies removed when a tombstone exists. Both primary and
endorsement SQL statements are exercised against real PostgreSQL fixtures.

Detail, API, hub, browse and sitemap responses use
`public, s-maxage=300, must-revalidate`; empty API and missing routes use `no-store`.
The existing explorer cache permits an additional 3600s stale-while-revalidate window.
Database removal alone does not prove cached-content removal. For urgent removal use
the existing `railway cdn purge html` operation with explicit production project,
environment and service selectors, then verify headers and absence on affected public
URLs, API and filtered explorer. This checkpoint does not authorize production writes
or purges. Verify actual CDN behavior after merge.

## Read-only current-corpus measurement

Measured 2026-10-04 20:32 UTC using the authorized Railway database, without writes:

- 1,146 visible restaurants; 882 mapped; 52 indexable; 1,094 useful noindex details.
- 48 recognized city hubs, four eligible; 126 cuisine hubs, four eligible.
- 62 sitemap URLs: 52 restaurants, eight hubs, root and about.
- Catalog query plus eligibility: 1,013 ms; scoped representative detail query: 49 ms;
  detail public-data payload: 1,944 bytes.
- Built local app against read-only live data: detail HTML 19,800 bytes, cold 560 ms /
  warm 31 ms; explorer HTML 856,172 bytes / 336 ms; sitemap 6,919 bytes / 523 ms;
  representative hub HTML 34,244 bytes / 663 ms. These are samples, not load benchmarks.
- Deployed origin `https://oc-food.up.railway.app` was checked; new routes are not deployed.

## Verification

Dedicated PostgreSQL 16 fixture DB on loopback port 55417; never seed or truncate `.env`.
Final unit run: 370 passing, five skipped, including real database publication,
moderation, re-ingestion, alias and eager-metadata tests. Svelte check: zero errors /
zero warnings. Production build passed. Pipeline suite: 301 passing tests using the
disposable Python 3.11 environment `/private/tmp/ocfood167-venv`.

Public-page browser matrix: 320px, 390px, 1280px, JavaScript-disabled initial detail/hub
HTML, source attribution, XML, robots, malicious text, ordinary/modified/middle click,
Enter/Space, and fixture takedown across surfaces. Eight pass, four platform skips.
Existing explorer regressions: 68 pass, 66 platform/opt-in skips. No live moderation
mutation was performed; tests use synthetic records. Exact-head CI must pass before merge.

Local logs: `/tmp/issue167-unit-final.log`, `/tmp/issue167-check-final.log`,
`/tmp/issue167-build-final.log`, `/tmp/issue167-browser-final.log`,
`/tmp/issue167-explorer-regressions.log`, `/tmp/issue167-pipeline-final.log`,
`/tmp/issue167-live-coverage-final.log`. Graph generation was stale (2026-09-25);
current worktree source and direct PostgreSQL/browser checks supplied verification.

## Release sequence after authorization

1. Merge #226, wait for deployment, verify location controls and `/about` disclosure.
2. Rebase/retarget this PR onto actual main, rerun required CI, merge and await deployment.
3. Read initial production HTML for `/r/akafuji-2` (eligible), `/r/12-oceanfront` (thin),
   `/r/399-vietnamese-kitchen` (unmapped), a nonexistent slug and `/city/costa-mesa`.
   Refresh the samples if evidence changed; verify robots/canonical/cache contracts.
4. Parse live sitemap and robots; validate every URL against current shared policy.
5. Use existing removed examples for read-only absence checks. Do not perform a real
   takedown as QA. Verify CDN behavior/purge procedure without claiming instant erasure.
6. Reconcile/close #158 and #167 only after their deployed acceptance is proven.

Search Console is optional and requires account access. Schema.org validity and Google
rich-result eligibility are different: see https://schema.org/Restaurant and
https://developers.google.com/search/docs/appearance/structured-data/review-snippet.
Noindex pages must remain crawlable:
https://developers.google.com/search/docs/crawling-indexing/block-indexing.
