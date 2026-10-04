# Comment attribute search implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make published comment attributes searchable without fuzzy matching prose (#166).

**Architecture:** PostgreSQL stores an English `tsvector` generated from each mention body and indexes it with GIN. A bounded, parameterized GET endpoint ranks matching eligible mentions and returns one plain-text excerpt per public restaurant. Client integration unions these beneath name/cuisine hits and intersects the existing visibility/facet filters.

**Tech Stack:** PostgreSQL core full-text search, Drizzle, SvelteKit, Vitest.

## Design and contract

The issue specifies database full-text search. Compared with shipping all comment bodies for client search or scanning bodies with SQL substrings, the indexed database approach keeps payloads small and supports token and quoted-phrase matching without approximate prose matches. No extension or hosted/local model is needed.

`GET /api/search?q=happy%20hour` returns an array of `{ slug, rank, quote }`. An optional integer `limit` defaults to 50 and is bounded at 100; `q` is trimmed and bounded at 160 characters. Blank queries return `[]`; invalid lengths/limits return HTTP 400. Unquoted terms use English lexeme matching (including stemming and stop words), with AND semantics; double quotes require phrase positions. PostgreSQL web-search OR/exclusion syntax is supported. This is token matching, not spelling similarity.

Eligibility matches the public dataset and its unconditional Mom & pop policy: `restaurants.status <> 'excluded'`, confidence other than `likely_chain`, published mentions, published threads, and the existing primary/names-restaurant gate. Pending-review unknown rows remain eligible. This reconciles the issue's older “active” wording with the currently visible queue behavior. The client also intersects API slugs with its currently filtered dataset. Taken-down text never contributes a match or excerpt.

The best mention for each restaurant is chosen by full-text rank, then Reddit score, then mention id. Restaurants sort by rank then slug for deterministic results. `ts_headline` uses quoted empty selection markers: quotes contain no injected highlight HTML, and clients render them as escaped text, never `{@html}`. PostgreSQL strips some source markup when producing excerpts; it is not a sanitizer, so escaping remains required. Only the requested excerpt is returned, not entire bodies or authors. [PostgreSQL text search documentation](https://www.postgresql.org/docs/current/textsearch-controls.html) describes lexeme/phrase matching and headline behavior.

## Task 1: Backend contract tests

Create `src/lib/server/api/comment-search.test.ts`. Cover blank queries without DB access, bounded validation, normalized parameter binding, result shape and non-cacheable responses. Run the focused test to observe missing endpoint behavior before implementation.

## Task 2: Generated search column and query

Modify `src/lib/server/db/schema.ts` with a generated custom `tsvector` column and GIN index. Run `npm run db:generate -- --name comment_attribute_search` and inspect the migration/snapshot. Create `src/lib/server/restaurants/comment-search.ts` and `src/routes/api/search/+server.ts` with the contract above. Re-run focused tests.

## Task 3: Real PostgreSQL verification

Create an opt-in integration test in `src/lib/server/restaurants/comment-search.integration.test.ts`. Require an explicitly supplied loopback-only `COMMENT_SEARCH_TEST_DATABASE_URL`, create an isolated temporary schema, apply repository migrations there, and seed synthetic restaurants/comments. Verify token false positives, quoted phrase adjacency, English stemming, all publication/visibility gates, rank selection/tie stability, literal HTML excerpts, generated-vector updates, and the index. Clean up only that owned schema. Run against a dedicated local PostgreSQL container; never run production SQL or copy `.env`.

## Task 4: Client integration

Create `src/lib/restaurants/comment-search.ts` with abortable 175 ms requests and stale-response suppression. Add failing lifecycle and union tests before implementing. Pass result slugs into the existing page filters and facet populations, keeping Fuse name/cuisine hits first and appending body-only matches by rank. ExplorerApp owns request state; SearchBar and RestaurantList show “Mentioned in comments” with escaped excerpts. Clearing/changing the query clears prior body matches immediately, and async completion refits the map. Failure states preserve name search and explain that comment search is unavailable.

The client requests at most 100 global comment matches. Facets narrow that restaurant set, and comment matching remains across all eligible public comments; a matching excerpt need not come from the selected subreddit/date slice. At the result cap, the UI asks users to refine the query rather than implying exhaustive coverage. A future pagination/filter-aware endpoint could remove this limitation.

## Task 5: Verification and review

Run `npm run check`, `npm test`, the PostgreSQL integration test, and `tests/comment-search.spec.ts` in both Playwright projects against the dedicated local fixture DB. Add the PostgreSQL test to the existing CI e2e job. Commit only focused files locally. Parent handles independent review, integration over #165 where state/teaser hunks overlap, and PR delivery.

Local validation on 2026-10-04: 331 unit tests pass, five PostgreSQL integration cases pass, and six mobile/desktop browser cases pass. Svelte diagnostics report no errors or warnings. No production DB or local/hosted model was used.

Independent review approved the implementation and ran 49 focused tests successfully. A temporary local merge with #165 / PR #224 (`de41bd3`) combined cleanly and passed Svelte checks, 335 unit tests, and the complete browser suite against a synthetic fixture database (63 passed, 51 expected project skips). The temporary merge was then discarded to keep the PRs independent. Land #224 first and refresh this branch against main before its final merge.

## Deployment considerations

The stored generated column computes existing bodies when added, then updates automatically on ingest. The migration takes the ordinary ALTER TABLE/index locks; deploy through the existing pre-deploy migration workflow. This work adds no production data repair and does not change takedown or chain status. API responses use `no-store` so query excerpts do not persist in public caches after moderation.
