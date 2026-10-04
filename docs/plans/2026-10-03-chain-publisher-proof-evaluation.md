# Chain scorer: publisher proof evaluation

This report preserves the intermediate experiments. The subsequent
[final scratch acceptance report](2026-10-03-chain-final-acceptance.md) records
the completed 1,214-row run, separate deterministic audit and the decision to
keep unproven model signals advisory. Its handoff supersedes the historical
next gate at the end of this report.

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

## Follow-up: operator evidence and a fresh sparse-publisher holdout

The follow-up keeps the original benchmark inputs and judgments above unchanged.
It freezes a stricter operator-quote prompt before reviewing new references,
then compares it with the same complete-quotes prompt. This remains a file-only
experiment on the merged #217 evaluator, not a production publisher gate.

### Operator evidence for the four unresolved pages

A blinded reviewer assessed each original page separately from newly acquired
same-publisher pages. All four original pages remain `unknown` under that review;
the expanded evidence supports `first_party_local` attribution for all four:

| Restaurant | Additional restaurant-publisher evidence | Local binding and limitations |
| --- | --- | --- |
| Memphis Cafe | [Home page](https://www.memphiscafe.com/) speaks as the restaurant about its cooking and staff. | [Hours/location](https://www.memphiscafe.com/hours-location) binds 2920 Bristol St to Costa Mesa. The home-page acquisition hit the byte cap; unseen footer content remains unverified. |
| Honda-ya | [About page](https://www.izakayahondaya.com/home/about-hondaya/) describes operating Honda-ya in first-person restaurant narration. | The same page identifies 556 El Camino Real, Tustin. An initial web-tool view showed an account-suspended redirect; subsequent direct extraction and web reads returned restaurant content. That inconsistency is acquisition uncertainty, not evidence of a confirmed outage. |
| Olive Pit | [Our Story](https://www.olivepitgrill.com/our-story) identifies its founders and describes the restaurant's food in its own voice. | The story page lists 240 S. Brea Blvd, Brea. The original homepage's uncredited history remains insufficient on its own. |
| Hatam | [Home page](https://www.hatamrestaurant.net/) identifies named family owners and speaks as the restaurant about its service. | The home page explicitly identifies 2383 W Lincoln Ave, Anaheim. The contact page also contains a Brookhurst address and inconsistent hours; current location chronology remains unresolved. |

Additional external records associate Memphis's domain and saved address in
[BizStanding](https://bizstanding.com/p/memphis%2Brestaurant-172281877), Olive Pit's
in [Yellow Pages](https://www.yellowpages.com/brea-ca/mip/olive-pit-mediterranean-grill-551517740?lid=551517740),
and Hatam's in [BBB](https://www.bbb.org/us/ca/anaheim/profile/banquet-facilities/hatam-restaurant-1126-1000119057).
These were inspected through the web tool after the direct extractor returned
403 responses. They corroborate domain/address association, not legal ownership
or authenticated website control. The listings can be stale or user-supplied;
BBB explicitly disclaims verification of third-party information. Honda-ya's
external listing timed out, so its follow-up attribution lacks acquired external
corroboration. Search snippets were not treated as evidence.

The reviewer assessed only the saved extractor packets, in which all four external
fetches were unavailable. The separate `browser-corroboration.json` records the
runner's later web observations. No external listing, manual judgment, or reference
label was injected into either hosted lane. The hosted follow-up bundle contains
only successfully extracted pages on the same publisher host; combining these
pages is an experimental input format, not implemented retrieval behavior.

### Frozen rule and holdout construction

The stricter prompt requires a substantive operator statement rather than a
title, copyright notice, navigation, address, customer review, or uncredited
third-person history. Its publisher quote must include the business name and
either identify owners/operators or bind the business to the publisher speaking
about operating its restaurant. Quote containment and the merged deterministic
local-address check remain unchanged. The rule does not add a deterministic
semantic validator, and a model can still violate its instructions.

The new holdout contains 24 distinct saved restaurants with no restaurant overlap
with the preceding 54-page benchmark:

- Twenty cached pages were sampled with seed `200218` from 85 pages across 57
  saved rows whose extracted text lacked a fixed set of operator/first-person
  phrases. Prior benchmark hosts and rows were excluded, then one row and host
  were retained per sampled page. This wording screen is a selection heuristic,
  not an ownership label. The earlier URL/text deduplication limitation still
  applies.
- Four reserved restaurants supply freshly acquired platform challenges: three
  Restaurantji pages and one NetWaiter page. Restaurantji is a familiar platform,
  so this is a restaurant/page holdout, not an entirely unseen-publisher test.
- Zuzu's Petals and Matty's Patty's cached acquisitions are flagged truncated.
  The independent reviewer assessed the supplied text, not unseen source content.
  Cached pages are held-out snapshots, not uniformly refreshed live pages.

A fresh blinded reviewer labeled all 24 cases without model outputs, prompts,
prior labels, or selection cohorts. The references are three `first_party_local`,
four `third_party`, 17 `unknown`, and zero `identity_mismatch`. The three positives
are Zuzu's Petals, Hickory & Spice BBQ, and The Dock. Hickory's About-page
attribution is interpretive: its detailed history names a person and describes
him tending its smokers, rather than explicitly authenticating the publisher.
This is independent session review, not cross-vendor reference adjudication or
production precision validation.

### Fresh holdout results

| Reference class | Cases | Complete-quotes accepted | Operator-quote accepted |
| --- | ---: | ---: | ---: |
| Supported restaurant-operated publisher | 3 | 3 | 3 |
| Known third-party publisher | 4 | 0 | 0 |
| Unresolved publisher attribution | 17 | 15 | 1 |
| Identity mismatch | 0 | 0 | 0 |

Accepted unresolved cases are not proven false positives. The stricter prompt
reduces unsupported promotion under this reference threshold, but the three
positive and four negative references are too few and too selectively sampled
to establish a safe general precision or recall rate.

| Case | Saved restaurant | Reference | Complete-quotes accepted | Operator-quote accepted |
| --- | --- | --- | --- | --- |
| 000 | Shik Do Rak | unknown | yes | no |
| 001 | Beale's Texas BBQ | unknown | yes | no |
| 002 | Tio Flaco's Tacos | unknown | no | no |
| 003 | Bravo Avo | unknown | yes | no |
| 004 | Bagel Shack | unknown | yes | yes |
| 005 | Nova Kitchen & Bar | unknown | yes | no |
| 006 | Simply Fish! | unknown | yes | no |
| 007 | Hanuman Thai Eatery | unknown | yes | no |
| 008 | Pho Dakao | unknown | yes | no |
| 009 | Mastros | unknown | yes | no |
| 010 | El Paraiso | unknown | yes | no |
| 011 | Zuzu's Petals | first_party_local | yes | yes |
| 012 | Huntington Ramen | unknown | yes | no |
| 013 | Kawamata Seafood | unknown | no | no |
| 014 | Shabu Shabu Bar | unknown | yes | no |
| 015 | Cha Cha's | unknown | yes | no |
| 016 | Hickory & Spice BBQ | first_party_local | yes | yes |
| 017 | The Dock | first_party_local | yes | yes |
| 018 | Matty's Patty's Burger Club | unknown | yes | no |
| 019 | Windsor Browns | unknown | yes | no |
| 020 | Eat Chow — Restaurantji | third_party | no | no |
| 021 | Bangkok Corner — Restaurantji | third_party | no | no |
| 022 | Poppy & Seed — Restaurantji | third_party | no | no |
| 023 | Roll and Grill — NetWaiter | third_party | no | no |

Bagel Shack's accepted publisher quote is an ordering invitation for Portola
Hills; its local quote identifies the saved San Clemente branch in the page's
larger list. The reviewer found the local branch but no substantive operator
attribution. It is therefore an ownership ambiguity, not a demonstrated
wrong-address case. The model calls Kawamata's Gogiw page third-party; the
reviewer leaves its sparse publisher attribution unresolved. Both lanes abstain
from accepting that page.

On the four original unresolved pages, complete-quotes accepts 4/4 and the
operator-quote lane accepts 1/4: Olive Pit's uncredited history still passes.
Both lanes accept all four expanded same-publisher evidence bundles. Even there,
the stricter lane sometimes returns a weak title/history quote instead of the
substantive operator evidence available elsewhere in the bundle. Its accepted
Zuzu's and Hickory quotes likewise lack the fuller operator context that supported
the reference labels. A positive page reference does not prove the model's
selected publisher quote meets the stronger rule.

### Synthetic controls expose a remaining address-proof gap

Eight synthetic cases supplement the 32 real-page/bundle cases: two explicit
positive publishers, five negative identity/publisher cases, and one unresolved
branding-only page. The complete-quotes lane accepts 2/2 positives; the stricter
lane accepts 1/2 because it invents a local quote for the explicit-operator case,
which the exact-containment check correctly rejects. Both reject the copied fan
site, directory quoting restaurant copy, wrong-locality case, and another
business's address. Only the complete-quotes lane accepts the branding-only
unresolved page.

**Both lanes incorrectly accept the missing-city synthetic negative.** The
invented source contains:

```text
Example Kitchen is owned and operated by Robin Cook. We serve our guests here.
Visit us at 100 Main St. Tustin is part of the name of our regional dining guide.
```

Both models select the exact substring `Visit us at 100 Main St. Tustin` as their
local quote. The substring is present, and `source_identity` returns true:
the city suffix check accepts `Tustin` without requiring the following text to be
locality metadata. The complete original source also passes, including a variant
with `Main Street.` that preserves a listing separator before the city. Quote
clipping and abbreviated-street period removal are therefore not necessary causes.
Checking the full source alone is insufficient; the validator must distinguish
an address/listing's locality from adjacent narrative. Exact quote
containment plus a city suffix therefore does not prove locality in the original
source's complete address/listing context. This is a known synthetic failure,
distinct from the unresolved real-page references.
No chain counts were supplied to these requests, so the experiment reproduces
an identity-gate error, not a newly observed chain classification.

### Answer coverage, cost, reproduction and next gate

Each lane completes 40/40 requests with valid verdicts and no request errors.
Across all 40 cases, the complete-quotes raw verdicts are 30 first-party, nine
third-party and one unknown; all 30 first-party answers pass the current quote
checks. The operator-quote raw verdicts are 12 first-party, seven third-party and
21 unknown, with one first-party answer rejected for an invented quote. On the
24 holdouts alone those raw counts are respectively 18/5/1 and 4/5/15.
No numeric confidence field was requested, so zero-confidence answers are not
measured. Explicit unknowns and deterministic proof rejections are reported
separately from positive-reference recovery.

The experiment uses the same hosted Gemma model/settings and price ceilings as
the earlier run: temperature 0, reasoning disabled, 2,048 requested output tokens,
eight workers, a 12,000-character excerpt cap and a 16,000-byte complete-prompt
cap. There are 76 new successful request-cache records and four exact prior
request hits, reporting **$0.00681803** new usage. A first attempt cached answers
but stopped while packing synthetic output metadata because `restaurant_id` was
missing. Adding that non-prompt field and replaying preserved both prompt hashes,
the evaluator hash and successful caches. The final replay took 21.32 seconds;
that cache-assisted timing excludes the earlier attempt and is not fresh-call
throughput. No database access, local inference, committed scorer-code changes, chain
rerun, threshold changes, or production exclusions occurred.

New private artifacts are in
`output/chain-scorer/issue-200/publisher-ownership-20261003/`: `prepare.py`,
`selection.json`, standalone and operator reviewer packets/references,
`browser-corroboration.json`, `fetches.json`, `run.py`, frozen `prompts.json`,
`request-inputs.json`, `manifest.json`, both result lanes, `score.py`,
`scored-summary.json`, `run-summary.json`, `identity-regression.json`,
`inherited-cache.json`, and both fetch
and model caches. `reproduction-dependencies.json` pins these files, imported
source modules and sibling adapters/inputs. Reproduction also needs the earlier
expanded benchmark candidates/inputs and its 114 successful request-cache files,
the broad saved-row results, the pilot adapter and `/private/tmp/ocfr200-cache`
metadata. The new folder includes inherited model caches but alone does not supply
all preparation dependencies.

| New pin | SHA-256 |
| --- | --- |
| Holdout `inputs.json` | `6029b6afadc03225a993d5a8f42371332b87db905fd78e040e4597aae7373519` |
| Complete `request-inputs.json` | `4fe96406f4d18d181415ebc9c9867e337a12d29940e05b647b0d1979364cf9f8` |
| Operator reviewer input | `511742c4e8d5fc4125f015b21ba4a8a13097bec407b78a48b206a05ff00a0211` |
| Frozen `prompts.json` | `cb2fb606026500fb3afb59b76052bad0b9ff6e6e47f69d1054d9494d31563e23` |

Historical next gate for this experiment: keep #200 open and #201 gated, and
bind the selected local quote to its complete
original-source address/listing context and reproduce the missing-city rejection;
then validate publisher evidence semantically or preserve abstention when the
quote is only a title/history/ordering invitation. Replay the known controls and
fresh holdout before another broader chain evaluation. The full scratch rerun,
66 excluded controls, F6 disagreements and current five-to-seven-location audit
were subsequently completed at the candidate head in the linked final acceptance
report. Production integration remains separate.
