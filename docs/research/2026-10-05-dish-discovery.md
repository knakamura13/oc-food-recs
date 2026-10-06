# Issue #178: narrow dish-led discovery experiment

**Decision: finish the experiment and defer automated dish pages/extraction.** Keep #166 comment-text search as the discovery baseline. The sample demonstrates useful dish evidence beyond metadata search, but does not demonstrate a distinct retrieval benefit over comment search or improved visitor usability. A curated prototype makes attribution clearer; its manual filtering is not a tested production algorithm.

This records the bounded experiment requested in [#178](https://github.com/knakamura13/oc-food-recs/issues/178), following the [experiment design](../plans/2026-10-05-dish-discovery-design.md) and [execution steps](../plans/2026-10-05-dish-discovery.md). No production feature, taxonomy, schema, or data repair is delivered by this work.

## Method and evidence boundary

Captured on October 5, 2026, at `2026-10-06T00:03:36.722Z`, against source baseline `af2bdedc14d5cc16b5115f18a25a92ffe134a4a1`. Queries were fixed before reviewing: `pho`, `breakfast burrito`, `fish tacos`.

1. Run a PostgreSQL repeatable-read, read-only transaction using the deployed comment-search publication predicates: restaurant not excluded or likely-chain; thread included in publish; mention published; primary role or names-restaurant not false. Roll back the read transaction.
2. Preserve best mention per restaurant (rank descending, score descending, mention ID ascending), then rank restaurants by descending rank and ascending slug. Compare that complete ordering with the live `/api/search?q=...&limit=100` response. All three query orders and counts matched exactly.
3. Freeze the top ten restaurant/comment associations for each query. Review full local comment bodies and public parent context where attribution is ambiguous. Do not select replacement candidates after seeing poor results.
4. Mark explicit dish recommendations, recommendations supported by parent/post context, incidental dish text belonging elsewhere, and historical dish consumption without a clear endorsement. These are judgment labels from one completing reviewer, not independently corroborated ground truth.
5. Compare the thirteen supported candidates against the unchanged `filterRestaurantsByQuery` metadata-search function using their actual name, cuisine and location fields. Its match decision is per restaurant, so this bounded candidate check does not require a full-population ranking claim.

This is a top-ranked diagnostic sample, not a random corpus sample or a full relevance/recall audit. Shared source comments are not independent observations. Existing restaurant/branch identities are preserved; no identity resolution was attempted.

## Results

| Query | Matching attached mentions | Matching restaurant records | Unique matching comments | Unique comments in top ten | Explicit recommendations | Context-supported recommendations | Incidental dish associations | Historical consumption only |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| pho | 54 | 42 | 30 | 3 | 1 | 2 | 7 | 0 |
| breakfast burrito | 20 | 18 | 11 | 7 | 5 | 1 | 4 | 0 |
| fish tacos | 30 | 27 | 15 | 7 | 4 | 0 | 5 | 1 |

The thirty sampled associations draw on only **seventeen unique comments**. Thirteen associations support a dish recommendation; sixteen assign the dish text to another restaurant or its name; one describes historical fish-taco orders without clearly endorsing that dish. These counts are not estimates of corpus-wide search precision. Treating the Seasurf past-order reply as an implicit recommendation would raise the fish-taco count from four to five; the decision below is unchanged.

Metadata search misses **eleven of the thirteen supported candidates** (two pho, five breakfast-burrito, four fish-taco associations). The other two are Pho 101 and one Nick's Deli record. Ordinary comment search already retrieves all thirteen. Thus dish evidence adds value beyond metadata search, but this experiment supplies no new retrieval capability beyond #166.

The main error mechanism is whole-comment association. A long list praising pho at Omeli also appears under Carolina's, Hickory & Spice, Mi Rak and Olive Pit. Another list assigns chicken pho to Pho Dakao while appearing under El Paraiso, Kawamata Seafood and Mo Ran Gak. The fish-taco query also matches a restaurant named Baja Fish Taco in a list, creating unrelated associations for other listed businesses. The existing general search legitimately finds the comment; interpreting every attached restaurant as a dish recommendation would overstate the evidence.

Context prevents unfair rejections. The Mai Phung and Pho 101 reply directly answers a post asking for pho recommendations; Charlie's burrito praise directly replies to a comment naming Charlie's Best Burger. Conversely, Habibi Time's parent assigns it shawarma while assigning tacos to Normita's. The Seasurf parent establishes the venue, but its reply also reports menu removals and offers no clear fish-taco endorsement. Sources are linked in the frozen sample below.

## Prototype and verification

A local, self-contained comparison offers the three dish queries and two views:

- **Current search:** the captured top ten comment-search API results and their original headline quotes, with experiment review annotations clearly identified.
- **Reviewed evidence:** the supported subset of that exact sample (3 / 6 / 4), preserving relative order and showing exact supporting excerpts, comment dates, source links, and parent-context reliance.

The prototype says these are historical community recommendations, not verified current menu items. It preserves existing restaurant identities and warns that separate records may refer to the same business or multiple branches. In particular, the Nick's records must not be treated as newly verified distinct venues.

Real source text, source exports, prototype HTML/data and screenshots stay local under ignored `output/issue-178/` and the task's visualization directory, per CONTRIBUTING.md. This public report stores only aggregates, source identifiers/links and paraphrased review decisions.

Verified with headless Chromium/Playwright:

- All 18 query/view combinations at widths 320, 390 and 1280 pixels preserve expected counts, original order, exact captured/supporting quotes, source/detail links, and context disclosures.
- Keyboard radio switching, native select type-ahead, and attribution-details disclosure work at all three widths. The initial harness incorrectly assumed ArrowDown/Enter would change the macOS Chromium native select; diagnosis confirmed type-ahead selection and the corrected full run passed without prototype changes.
- No horizontal overflow or browser console/page errors. Phone and desktop screenshots were inspected.
- All thirteen supported restaurant detail links returned live HTTP 200.
- The unchanged application baseline passed 383 Vitest tests, with 11 skipped (52 files passed / 2 skipped).

These verify behavior and evidence consistency, not improved visitor usability. No user study was run.

## Decision against the issue's gates

| Gate | Finding | Decision |
|---|---|---|
| Accurate recommendations | Supported evidence exists, but whole-comment matches frequently assign a dish to another listed restaurant. Parent context and excerpt-to-restaurant binding matter. | A shortcut or dish label over raw matches is insufficient. Manual curation demonstrates presentation only. |
| Distinct value beyond general search | Comment search already retrieves every supported sampled candidate. | No distinct retrieval benefit established. |
| Easier for visitors | The prototype exposes evidence and provenance clearly; no visitor task study or owner usability result was collected. | Improved usability remains unproven. Do not infer it from a screenshot or manually filtered list. |
| Menu trust and small scope | Dates and historical-evidence limitations are explicit; existing identities and source/publication gates are preserved. | No current-menu claims or taxonomy expansion. |

**Defer production dish pages and automated dish extraction.** The experiment is complete with a defer decision, rather than leaving an unvalidated feature commitment open. If revisited, first test sentence/parent-based dish attribution on unseen comments (including multi-restaurant lists, brand-name matches and historical orders), then compare visitor tasks against the existing comment search. Preserve `unclear` outcomes and avoid counting duplicate records/comments as distinct recommendations. That possible follow-up is not scheduled implementation work.

## Frozen sample and review ledger

Positions below are the captured API's positions, not the full frontend's combined metadata/comment ranking. Mention IDs identify the exact attached restaurant/source association. Source links allow context review; no real comment exports or usernames are committed.

### pho

| Position | Restaurant record | Mention | Source | Review | Reason |
|---:|---|---:|---|---|---|
| 1 | `carolina-s` | 1929 | [t1_oe7mnu6](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe7mnu6/) | Dish text belongs elsewhere | Italian dishes are assigned to Carolina's; pho praise belongs to Omeli Kitchen. |
| 2 | `el-paraiso` | 1559 | [t1_oe021f4](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe021f4/) | Dish text belongs elsewhere | El Paraiso is recommended for pupusas; chicken pho belongs to Pho Dakao. |
| 3 | `hickory-spice-bbq` | 1928 | [t1_oe7mnu6](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe7mnu6/) | Dish text belongs elsewhere | Brisket and pulled pork belong to Hickory & Spice; pho belongs to Omeli Kitchen. |
| 4 | `kawamata-seafood` | 1565 | [t1_oe021f4](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe021f4/) | Dish text belongs elsewhere | Poke belongs to Kawamata Seafood; chicken pho belongs to Pho Dakao. |
| 5 | `mai-phung` | 2364 | [t1_o14g491](https://www.reddit.com/r/santaana/comments/1qgnlvn/comment/o14g491/) | Recommendation with context | A direct reply recommends Mai Phung for northern style in the Best Pho in SA thread. [Context](https://www.reddit.com/r/santaana/comments/1qgnlvn/). |
| 6 | `mi-rak-korean-bbq` | 1927 | [t1_oe7mnu6](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe7mnu6/) | Dish text belongs elsewhere | Cold noodles and goat stew belong to Mi Rak; pho belongs to Omeli Kitchen. |
| 7 | `mo-ran-gak-2` | 1546 | [t1_oe021f4](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe021f4/) | Dish text belongs elsewhere | KBBQ belongs to Mo Ran Gak; chicken pho belongs to Pho Dakao. |
| 8 | `olive-pit` | 1930 | [t1_oe7mnu6](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe7mnu6/) | Dish text belongs elsewhere | Lamb chops belong to Olive Pit; pho belongs to Omeli Kitchen. |
| 9 | `omeli-kitchen` | 1933 | [t1_oe7mnu6](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe7mnu6/) | Explicit recommendation | An explicitly named Omeli Kitchen list item praises its beef rib pho. |
| 10 | `pho-101` | 2360 | [t1_o14g491](https://www.reddit.com/r/santaana/comments/1qgnlvn/comment/o14g491/) | Recommendation with context | A direct reply names Pho 101 as a pick in the Best Pho in SA thread. [Context](https://www.reddit.com/r/santaana/comments/1qgnlvn/). |

### breakfast burrito

| Position | Restaurant record | Mention | Source | Review | Reason |
|---:|---|---:|---|---|---|
| 1 | `nick-s-deli-2` | 1831 | [t1_oe65hym](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe65hym/) | Explicit recommendation | Explicit praise for breakfast burritos at Nick's. Preserve the existing restaurant identity; no new branch claim. |
| 2 | `nicks-burritos` | 1771 | [t1_oe2oluo](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe2oluo/) | Explicit recommendation | Names Nick's, mentions Seal Beach or Los Alamitos, and calls its breakfast burritos the best. This does not distinguish branches. |
| 3 | `adana-mediterranean-grill` | 2112 | [t1_og9oob3](https://www.reddit.com/r/orangecounty/comments/1slszch/comment/og9oob3/) | Dish text belongs elsewhere | The breakfast burrito statement belongs to Reynolds Sandwich in a multi-restaurant list. |
| 4 | `charlie-s-best-burger` | 241 | [t1_k5xemcu](https://www.reddit.com/r/Fullerton/comments/17dj8cg/comment/k5xemcu/) | Recommendation with context | The burrito praise directly replies to a comment naming Charlie's Best Burger. [Context](https://www.reddit.com/r/Fullerton/comments/17dj8cg/comment/k5xdhdc/). |
| 5 | `desimone-s` | 2109 | [t1_og9oob3](https://www.reddit.com/r/orangecounty/comments/1slszch/comment/og9oob3/) | Dish text belongs elsewhere | The breakfast burrito statement belongs to Reynolds Sandwich; Desimone's receives sandwich praise. |
| 6 | `george-s-hamburgers` | 1538 | [t1_oe0na2b](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe0na2b/) | Explicit recommendation | Names George's in Fullerton for a breakfast burrito; the following Roll and Grill mention is separate. |
| 7 | `la-porte-a` | 2114 | [t1_og9oob3](https://www.reddit.com/r/orangecounty/comments/1slszch/comment/og9oob3/) | Dish text belongs elsewhere | The breakfast burrito statement belongs to Reynolds Sandwich, not La Porteña. |
| 8 | `ljs-cafe` | 1291 | [t1_norxrmx](https://www.reddit.com/r/orangecounty/comments/1owc472/comment/norxrmx/) | Dish text belongs elsewhere | Breakfast burritos are assigned to Nick's Deli; LJs is a separate cafe mention. |
| 9 | `los-de-juarez` | 829 | [t1_odn24yt](https://www.reddit.com/r/Anaheim/comments/1s8tkfm/comment/odn24yt/) | Explicit recommendation | Names Los de Juarez and explicitly likes its breakfast burritos. |
| 10 | `nick-s-deli` | 1259 | [t1_norxrmx](https://www.reddit.com/r/orangecounty/comments/1owc472/comment/norxrmx/) | Explicit recommendation | The comment assigns breakfast burritos to Nick's Deli in Seal Beach. |

### fish tacos

| Position | Restaurant record | Mention | Source | Review | Reason |
|---:|---|---:|---|---|---|
| 1 | `ensenada-s-surf-n-turf` | 858 | [t1_odk0ov8](https://www.reddit.com/r/Anaheim/comments/1s8tkfm/comment/odk0ov8/) | Explicit recommendation | Names Ensenada's Surf n' Turf for Ensenada-style fish tacos. |
| 2 | `chellas` | 527 | [t1_kd4r5rf](https://www.reddit.com/r/SanClemente/comments/18h01rl/comment/kd4r5rf/) | Dish text belongs elsewhere | Chellas gets crispy-taco praise; fish-taco praise explicitly belongs to Jon's Fish Market. |
| 3 | `jon-s-fish-market` | 528 | [t1_kd4r5rf](https://www.reddit.com/r/SanClemente/comments/18h01rl/comment/kd4r5rf/) | Explicit recommendation | Explicitly names and praises fish tacos at Jon's Fish Market. |
| 4 | `normita-s-tacos` | 1884 | [t1_oe651eh](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe651eh/) | Explicit recommendation | Names Normita's and specifically recommends the two-fish-tacos dish. |
| 5 | `sea-surf` | 571 | [t1_mtxfhpd](https://www.reddit.com/r/SanClemente/comments/1kastjy/comment/mtxfhpd/) | Past orders; no clear endorsement | Parent context binds the past orders to Seasurf, but the reply praises the burger rather than clearly recommending fish tacos. It also warns of menu changes. [Context](https://www.reddit.com/r/SanClemente/comments/1kastjy/comment/mpr853g/). |
| 6 | `beach-pitt-bbq` | 878 | [t1_hl6vb2s](https://www.reddit.com/r/lagunaniguel/comments/qrryid/comment/hl6vb2s/) | Dish text belongs elsewhere | Fish taco occurs in the separate Baja Fish Taco restaurant name; no fish-taco recommendation is attributed here. |
| 7 | `calo` | 880 | [t1_hl6vb2s](https://www.reddit.com/r/lagunaniguel/comments/qrryid/comment/hl6vb2s/) | Dish text belongs elsewhere | Fish taco occurs in the separate Baja Fish Taco restaurant name; no fish-taco recommendation is attributed here. |
| 8 | `habibi-time` | 1867 | [t1_oe79sum](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe79sum/) | Dish text belongs elsewhere | The parent assigns tacos to Normita's and shawarmas to Habibi Time; the reply expresses future interest rather than a Habibi fish-taco recommendation. [Context](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe4fagj/). |
| 9 | `los-cotijas` | 1148 | [t1_noq3xs5](https://www.reddit.com/r/orangecounty/comments/1owc472/comment/noq3xs5/) | Explicit recommendation | Explicitly names Los Cotijas for fish tacos. |
| 10 | `plumerias` | 879 | [t1_hl6vb2s](https://www.reddit.com/r/lagunaniguel/comments/qrryid/comment/hl6vb2s/) | Dish text belongs elsewhere | Fish taco occurs in the separate Baja Fish Taco restaurant name; no fish-taco recommendation is attributed here. |

## Reproduction notes

Use the current `src/lib/server/restaurants/comment-search.ts` query and `/api/search` contract as the baseline, with a read-only database connection. To reproduce the frozen selection with local source inspection, use the same predicates and best-mention ordering, limiting the outer query to ten:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH q AS (
  SELECT websearch_to_tsquery('english', 'pho') AS query
), best AS (
  SELECT DISTINCT ON (r.id)
    r.slug, m.id AS mention_id, m.thread_id, m.comment_id,
    ts_rank_cd(m.body_tsv, q.query) AS rank
  FROM mentions m
  JOIN restaurants r ON r.id = m.restaurant_id
  JOIN threads t ON t.id = m.thread_id
  CROSS JOIN q
  WHERE m.body_tsv @@ q.query
    AND r.status <> 'excluded'
    AND COALESCE(r.chain_confidence, 'unknown') <> 'likely_chain'
    AND t.included_in_publish = true
    AND m.status = 'published'
    AND (m.role = 'primary' OR m.names_restaurant IS NOT FALSE)
  ORDER BY r.id, rank DESC, m.score DESC, m.id ASC
)
SELECT * FROM best ORDER BY rank DESC, slug ASC LIMIT 10;
ROLLBACK;
```

Repeat for the other two fixed queries. Changing source data or publication state can change the live result set; use the identifiers in the ledger to distinguish a rerun from this capture. Any future attribution algorithm needs an unseen evaluation set: applying these manually authored labels to the same sample would be an oracle illustration, not a valid accuracy measurement.
