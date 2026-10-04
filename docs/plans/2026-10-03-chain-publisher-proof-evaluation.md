# Chain scorer: publisher proof evaluation

After #217 merged as `0cc665648dd238d98b84c06e7d7cf5b04775a707`, evaluated a
file-only alternative to the unchanged Jev official-source threshold. The complete-
quote prompt accepted 32/34 positive publisher references and rejected all 15
known negative references. It also accepted four of five unresolved ownership
cases. **That unresolved acceptance prevents a production precision claim.**

A separate private chain diagnostic recovered 8/15 supported flags from the
previously curated 31-row cohort without reviewed publisher labels in its model
requests. It did not complete #200 or authorize #201 integration. No production
code, database state, threshold, or exclusion behavior changed.

## Corpus and reference review

The benchmark contains 54 distinct URL/text page entries:

| Selection | Pages | Method |
| --- | ---: | --- |
| Earlier publisher pilot | 17 | Deduplicated earlier 18 input entries; prior references reused. |
| New local candidates | 20 | Seed `200217`, one saved row each, selected from cached pages passing the merged local-address check. |
| Local review directories | 5 | Restaurant Guru pages that match the saved local address despite being third-party publishers. |
| Newly discovered pages | 8 | Eight usable texts from 11 fetch attempts, including Allmenus, Restaurantji, Cafe Inspector, NetWaiter and two restaurant pages. |
| Prior rejected identities | 4 | Preserved source pages for Cassidy's, Azteca, Navarros and Huckleberry's. |

The new local-candidate sampling frame contains 249 anchored pages among 2,686
unique cached URL/text candidates. Its construction deduplicates URL/text before
sampling and can discard another saved row's association with the same page.
Therefore it is a convenience frame, not an exhaustive or uniform restaurant
sample. New negatives were deliberately selected by publisher type. Uber Eats,
DoorDash and Zmenu could not be acquired by the extractor, so this benchmark
provides no result for their fetched pages. Search snippets were not substituted
for unavailable full extracted text.

A fresh reviewer labeled all 37 new cases from saved name/street/city and all
saved extracted page text without model outputs, previous judgments, or selection labels.
All nonempty reference quotes and all source hashes were verified. Cafe Inspector
Soltani (`page-044`) was acquisition-truncated at 30,000 characters, so complete-
page and footer coverage are unverified for that case. Reference counts are:

| Reference verdict | Prior pilot | New cases | Total |
| --- | ---: | ---: | ---: |
| First-party local | 16 | 18 | 34 |
| Third-party | 1 | 11 | 12 |
| Identity mismatch | 0 | 3 | 3 |
| Unknown | 0 | 5 | 5 |

The fresh reviewer and experiment runner use different sessions, but this is not
independent cross-vendor reference adjudication. Ambiguous ownership remains
unresolved rather than being converted into a negative or positive label.

## Frozen prompt comparison

Both lanes use hosted `google/gemma-4-31b-it`, temperature 0, reasoning disabled,
2,048 requested output tokens, eight workers, and the same saved rows and public
texts. Inputs contain no chain decisions, count-audit labels, or publisher
reference verdicts. Excerpts include source beginnings and ends, address/city neighborhoods
and ownership/disclaimer neighborhoods, capped at 12,000 characters. The complete
prompt is also rejected above 16,000 UTF-8 bytes. This is a conservative size
heuristic, not an exact token measurement or complete-page evidence guarantee.

The baseline is the original publisher-pilot prompt. The second prompt, frozen
before the new reference verdicts were read, asks for the complete business name
in the publisher quote and a complete local address listing in the local quote.
An accepted result requires a `first_party_local` verdict, two nonempty exact
source quotes, and the merged `source_identity` check on those quoted excerpts.
The check still does not independently establish publisher ownership.

| Measure | Baseline | Complete quotes |
| --- | ---: | ---: |
| Successful requests / valid verdicts | 54/54 | 54/54 |
| Raw first-party / third-party / unknown answers | 38 / 16 / 0 | 38 / 15 / 1 |
| Accepted positive references | 28/34 | 32/34 |
| Accepted known negative references | 0/15 | 0/15 |
| Accepted unresolved references | 4/5 | 4/5 |
| Raw positive verdicts rejected by proof checks | 6 | 2 |
| Total accepted pages, including unresolved cases | 32 | 36 |

On the 37 new cases, positive acceptance improves from 16/18 to 18/18, with
0/14 known negatives accepted in both lanes. Both lanes also accept the same
four unresolved cases. On the 17 familiar pages, acceptance improves from 12/16
to 14/16 positives, with the one unaffiliated publisher rejected. Familiar-page
results must not be presented as held-out performance. Neither prompt requests a
numeric confidence, so zero-confidence answer counts do not apply to this
publisher task; explicit model abstentions and proof-check rejections are reported
separately above.

The improved quotes recover Birrieria Guadalajara, Gus's World Famous Fried
Chicken, Pure Burger Bar and Guichos. The remaining positive misses are Chronic
Tacos' city-first fundraising selector and Tasty Noodle House's `#320` unit in the
quoted address. Both receive positive model verdicts but fail the merged strict
local-address proof. No city matching, unit normalization or ownership threshold
was relaxed to recover them.

## Unresolved ownership accepted by both lanes

| Case | Saved restaurant | Missing reference evidence |
| --- | --- | --- |
| `page-020` | [Memphis Cafe](https://www.memphiscafe.com/hours-location) | Matching address/hours/order controls without publisher attribution or substantive operator statement. |
| `page-030` | [Honda-ya](https://www.izakayahondaya.com/home/tustin/) | Matching branded menus and local address without enough ownership attribution in the selected page. |
| `page-036` | [Olive Pit](https://www.olivepitgrill.com/) | Uncredited third-person brand history and matching venue details. |
| `page-048` | [Hatam](https://www.hatamrestaurant.net/contact) | Generic contact/copyright text with Lincoln and Brookhurst addresses, without sufficient operator attribution. |

The fifth unresolved reference, Huckleberry's (`page-053`), is rejected in both
lanes. Its restaurant-attributed brand page does not establish that it operates
the saved Gothard Street/Huntington Beach restaurant. These four accepted cases
are not established false positives. They are unresolved decisions that prevent
safe automatic promotion.

For contrast, the acquired [Allmenus Soltani page](https://www.allmenus.com/ca/santa-ana/715068-soltani-restaurant/menu/)
provides restaurant details and menu attribution to Allmenus, and the
[NetWaiter Guichos page](https://guichoseatery2.netwaiter.com/san-clemente/about/#)
provides a local venue profile. Both prompts reject these as third-party
publishers. A local address or ordering interface remains insufficient ownership
proof. The previously reviewed unaffiliated Irvine Tasty Noodle House page is also
rejected despite its correct local address.

## Private automatic-publisher chain diagnostic

Reused the same 31 saved rows and preserved source texts from the earlier bounded
follow-up. These include 26 previously audited new flags and five controls, plus
curated URL hints from that work. This is not blind acquisition or evaluation of
all 1,214 snapshot rows.

Only S5 pages passing the merged local-address check are sent to the frozen
complete-quote publisher prompt. After row/URL/text deduplication this produces
20 candidate pages across 12 rows. Nineteen pages are accepted across 11 rows,
with the unaffiliated Irvine Tasty Noodle House page rejected. These 20 diagnostic
pages are not a second independent publisher test set; they substantially overlap
the familiar benchmark pages and include additional Moulin URL variants.
Publisher flags are derived only from the model verdict and deterministic quote
checks. No reviewed publisher verdicts are injected into this lane. The existing
S6 initial/repair extraction runs afterward with its exact request cache.

| Diagnostic measure | Result |
| --- | ---: |
| Final chain / unknown / independent rows | 8 / 23 / 0 |
| Supported positive lower bounds recovered | 8/15 |
| Rejected identities incorrectly flagged | 0/4 |
| Unresolved identity references flagged | 0/7 |
| Selected controls classified chain | 0/5 |
| Publisher or new chain request errors | 0 |

Each recovered flag is S6, with these grounded lower bounds:

| Saved row | Restaurant | S6 locations |
| --- | --- | ---: |
| 34 | Pitfire | 6 |
| 38 | Mother's Market | 12 |
| 148 | The Taco Stand | 6 |
| 376 | Pizza Port | 7 |
| 413 | Buona Forchetta | 7 |
| 496 | Moulin | 6 |
| 542 | Birrieria Guadalajara | 7 |
| 892 | Gus's World Famous Fried Chicken | 6 |

These are nonexhaustive lists, not complete worldwide totals. Mother's Market's
previous count/category limitations still apply, as do the prior Pizza Port
limitations. This diagnostic does not re-audit current operation or resolve those
precision limitations. Compared with the previous reviewed-publisher lane, Moulin
is recovered and Tasty Noodle House abstains. The equal 8/15 totals therefore do
not indicate an unchanged recovered set. Reusing cached outputs where requests
match is distinct from rerunning every chain request against a hosted model.

The 108 benchmark requests completed in 39.89 seconds and reported $0.010996.
Six additional unique publisher requests for the chain diagnostic bring the
publisher cache to 114 successful requests and $0.011580. The chain diagnostic
completed in 33.39 seconds with two new successful chain-cache records reporting
$0.000892; other initial/repair requests reused prior exact caches. Total reported
successful usage for this follow-up is **$0.012471**, excluding unmetered retries.
No local inference or database access occurred.

## Reproduction pins and decision

Private artifacts are under
`output/chain-scorer/issue-200/publisher-expanded-20261003/`: `prepare.py`,
`inputs.json`, `fetches.json`, `review-input.json`, `review.json`,
`run_expanded.py`, `manifest.json`, both result lanes, `scored-summary.json`,
request caches, and `run_chain_diagnostic.py` with `automatic-chain/` results.
The expanded folder alone is not a complete private rerun bundle. Required sibling
inputs include `publisher-proof-20261003/run_pilot.py`, the parent
`run_openrouter.py` hosted adapter, `entity-identity-hosted-20261003/` publisher
review inputs/verdicts, `pre-gemma-rows.json`, `contexts.json` and its exact `models/`
cache, plus `broad-20261003/` results, contexts and classification audit references.
The cached public fetches under `/private/tmp/ocfr200-cache` are also needed to
repeat preparation without reacquisition. `reproduction-dependencies.json` pins
these sibling files, imported source modules and both model-cache snapshots. Use
the merged source commit recorded above for an exact request replay.

These files remain gitignored. Hashes identify the referenced inputs; the public
report alone does not provide the private inputs needed for exact reproduction.

| Pin | SHA-256 |
| --- | --- |
| Evaluator source on merged #217 | `c5e4b5e25e51d95987a7fa38482398c2648d8995a5cbd7bd28378170f86b9434` |
| Benchmark `inputs.json` | `503025550fccf06a15fe2ccee2d1c5d9d694d3b242f97d3832069c6134e06926` |
| Independent new-case `review.json` | `b1c009b6fc5e50b0e868b1bbe79a586d8319f1ed4b9eb42ad63548051ffa137d` |

Keep #200 open and #201 gated. The next step is to seek independently corroborated
operator evidence for the four accepted unresolved pages, then test those rules
on new ambiguous publishers without using test labels as model inputs. Preserve
abstention when ownership remains unclear. Saved-address formats, aliases and
extraction failures remain separate recall blockers. A full rerun and the broader
acceptance criteria in `CHAIN_SCORER_RESUME_PLAN.md` are still required before any
production exclusion decision.
