# Chain scorer final scratch acceptance and integration recommendation

The full hosted evaluation at `3ac531263e3b87448c8faaadbad6dc51954e3368`
was subsequently validated at repaired candidate commit
`0465cdd550f7018a965ca43287dccafc6b0c66ba` (PR #219). Its
production precision decision is conservative: keep model-based S4/S5/S6 evidence
advisory, preserve unknown visibility, and consider the separately audited
S3+S1 decisions for #201. This report does not apply exclusions or establish
that an unknown row is independent. #200's evaluation can be accepted without
requiring an unsuccessful publisher-proof experiment to become production code.
#201 still requires its own reviewed integration and scratch dry run.

## Repaired-head cache validation

A subsequent P1 review found that the third-party count path removed a street
abbreviation period before splitting count quotes. This could join
`Example Kitchen at 100 Main St. Tustin has six locations.` into a false
attributed count. The focused repair retains that sentence boundary while
preserving abbreviation periods before a comma and directional abbreviations
internal to the saved street. Failing S4/S5 and end-to-end model-error tests
reproduced the promotion before the repair. The repaired head passes 291 pipeline
tests, including 94 scorer tests, and has green CI.

At `0465cdd550f7018a965ca43287dccafc6b0c66ba`, the full 1,214-row cascade was
recomputed into fresh checkpoints using the same public acquisition and exact
model responses. A fail-closed adapter raises on a cache miss before any hosted
or local model request. This replay finished in 104.02 seconds, with **zero new
model requests and zero cache misses**. Final JSON/JSONL rows, summary and
comparison are identical to the original evaluation; all seven public-table
fingerprints remain unchanged. The hashes below therefore describe both runs.
The original model-call cost and runtime remain the measurements for the hosted
run; cached replay timing is not fresh inference throughput.

Private replay artifacts and `cache-replay-verification.json` are in sibling
`count-boundary-replay-20261003/`, with the repaired code/source hashes, frozen
acquisition provenance and fresh per-row artifacts. Neither candidate-head
verification nor green CI asserts that PR #219 has merged. This closes the
observed count-path defect without converting unknowns into exclusions or
revalidating the rejected publisher prompts as production authority.

## Inputs, safety and execution

- Cohort: all 1,148 active restaurants and all 66 excluded-chain controls, 1,214 unique IDs.
- Original hosted-run code: `3ac531263e3b87448c8faaadbad6dc51954e3368`; repaired replay: `0465cdd550f7018a965ca43287dccafc6b0c66ba`. Every imported chain source module is SHA-256 pinned in each private manifest. PR #219 supplies the locality/count-context fixes; this is candidate-head evidence rather than a claim that it has landed on main.
- Restore: `prod-pre-154-20261001T035812Z.dump`, SHA-256 `f93ae84b892b299a73f7ca5f1a08802f23b807dc94257944c893058a1318910d`. Its checksum was reverified during this run.
- Explicit loopback `ocfr200_scratch` database and `ocfr200_reader` role. Live privilege inspection confirms SELECT on all seven public tables, no table write/reference privileges, and no superuser/create-role/create-database privileges. All scorer transactions are forced read-only. The scorer loads no production `.env`.
- Every public-table count/hash matched the saved restore before evaluation and matched again afterward: excluded_brands, geocode_cache, mentions, merge_log, restaurant_aliases, restaurants and threads.
- Public acquisition is frozen from `broad-20261003`. Lookup results and pages were reused; decisions, evidence and final rows were recomputed. Current-code candidate URL sets exactly match the frozen acquisition inputs. Fresh per-row checkpoints prevent reuse of old classification outputs. Curated audit URLs/reference labels were not added to inference.
- Overture `2026-09-23.1`, the NSI fourteen-category manifest/commit, ATP run/archive hash and compact cache, plus local/global extract hashes are pinned in `safety-and-source-pins.json`. Cached global extracts are worldwide, not SoCal-only.
- Hosted Gemma `google/gemma-4-31b-it`, temperature 0, JSON, reasoning disabled, 2,048 requested output tokens, eight workers and provider price caps $0.09 input / $0.34 output per million tokens. Existing adapter retries incomplete completions with recorded effective output budgets. Jev is `typesafe/jev-1.13`. No local inference ran.
- Elapsed current run: 10.69 minutes. Successful exact-request model caches were seeded, while changed inputs required fresh calls. New request-cache records: `{'jev': 6244, 'openrouter-gemma': 1248}`. API usage reported for new records: **$0.66515328**; historical cache costs and unmetered failed attempts are excluded.
- Website acquisition failures: 616; ATP parse errors: 19. Failed acquisition is a recall limitation and never proves independence. Final Gemma error rows: 0; per-attempt errors: 0; Jev error rows: 0.

## Decisions and signal limits

| Cohort | Rows | Chain | Verified independent | Unknown | Signals |
| --- | --- | --- | --- | --- | --- |
| Active | 1148 | 2 | 0 | 1146 | S3+S1: 2 |
| Excluded controls | 66 | 7 | 0 | 59 | S3+S1: 7 |

Excluded-control recall is **7/66 (10.61%)**.
These are existing exclusion controls, not a newly adjudicated negative/positive test set.
Relative to the complete broad run after #214, 52 rows change decision.
The stronger entity/locality gates reduce recall; their abstentions must not be
reported as verified independence or used to silently reinclude human exclusions.

Current decisions use the normal scorer; none of the private publisher prompts
below were patched into it. S1 global-domain evidence, S2 corroborated exact-name
counts and NSI matches were evaluated but did not independently produce a current
decision. No S4, S5 or S6 decision survives this run. Zero positive decisions is
not evidence of model precision. Earlier S6 wrong-identity findings, this run's
low recovery and the private publisher experiments argue against using those
signals as automatic production exclusion authority.

The raw Gemma first responses are 81 chain, nine independent and 1,115 unknown;
after repair they are 45 chain, nine independent and 1,151 unknown. Grounding and
identity checks reject every non-unknown model decision. Only one of the 6,623
source contexts is marked official by the unchanged Jev 0.95 gate. That publisher
gate is a major recovery limitation. Model-proposed independence is therefore
not a verified negative, and relaxing the threshold would need its own validation.

### Separate deterministic audit

All nine current S3+S1 flags use **ATP local brand/spatial matching plus a local
Overture family-name match and ATP global location count**. They are not an
NSI-plus-domain-count audit. Primary-source checks support six-plus worldwide
brand operation for all seven distinct brands; six rows also have independently
matched saved streets. Three excluded controls lack saved streets and retain a
local-identity qualification. The two active flags are both supported Polly's
Pies addresses. This exhaustive audit of the observed nine decisions is a small,
selected population, not a general precision estimate or permission to trust
future brand/spatial matches without review.

| ID | Restaurant | Saved locality | Signal | Cached count | Independent assessment |
| --- | --- | --- | --- | --- | --- |
| 69 | McDonald's | Costa Mesa | S3+S1 | 27587 | Brand threshold supported; saved street absent |
| 150 | Del taco | Costa Mesa | S3+S1 | 557 | Brand threshold supported; saved street absent |
| 267 | Papa John's | Fullerton | S3+S1 | 4497 | Supported threshold and saved street |
| 399 | Del Taco | San Clemente | S3+S1 | 557 | Brand threshold supported; saved street absent |
| 473 | Chart House | Dana Point | S3+S1 | 21 | Supported threshold and saved street |
| 567 | Veggie Grill | Tustin | S3+S1 | 15 | Supported threshold and saved street |
| 938 | L&L Hawaiian Barbecue | Costa Mesa | S3+S1 | 250 | Supported threshold and saved street |
| 1166 | Polly's Pies | Fullerton | S3+S1 | 12 | Supported threshold and saved street |
| 1199 | Polly's Pies Restaurant | Santa Ana | S3+S1 | 12 | Supported threshold and saved street |

Primary evidence: [Polly's index](https://www.pollyspies.com/locations/) has twelve
distinct addresses; current [Fullerton](https://www.pollyspies.com/locations/fullerton/)
and [Santa Ana](https://www.pollyspies.com/locations/santa-ana/) pages match the saved
streets and provide operating hours. Six same-brand Chart House pages have current
addresses/hours: [Alexandria](https://www.chart-house.com/location/chart-house-alexandria-va/),
[Boston](https://www.chart-house.com/location/chart-house-boston-ma/),
[Cardiff](https://www.chart-house.com/location/chart-house-cardiff-ca/),
[Atlantic City](https://www.chart-house.com/location/chart-house-atlantic-city-nj/),
[Daytona Beach](https://www.chart-house.com/location/chart-house-daytona-beach-fl/)
and [Dana Point](https://www.chart-house.com/location/chart-house-dana-point-ca/).
That lower bound excludes Peohe's and Chart House Prime and does not validate the
cached count of 21 as a complete current total.

[Veggie Grill's current feature page](https://www.veggiegrill.com/event/fall-harvest-features/)
names seven participating restaurant locations, and its
[Tustin page](https://www.veggiegrill.com/location/veggie-grill-the-marketplace-in-tustin/)
anchors the saved street. [L&L's Costa Mesa page](https://www.hawaiianbarbecue.com/locations/costa-mesa/)
anchors the saved address and states a brand footprint above 200; franchise
ownership does not erase the common brand. [Del Taco's 2026 company release](https://deltaco.com/news%26item_id%3D259.html)
supports a footprint well above six; its [Costa Mesa](https://locations.deltaco.com/us/ca/costa-mesa/2956-bristol-st)
and [San Clemente](https://locations.deltaco.com/us/ca/san-clemente/109-via-pico-plaza)
locators support name/city while the saved streets are absent.
[Papa John's June 2026 operating disclosure](https://ir.papajohns.com/financials/sec-filings/content/0001628280-26-053810/pzza-62826xpressrelease.htm)
and [Fullerton locator](https://locations.papajohns.com/united-states/ca/92831/fullerton/2327-e-chapman-ave)
support its threshold and local street. [McDonald's annual report](https://www.sec.gov/Archives/edgar/data/63908/000006390826000035/mcd-20251231.htm)
supports the global threshold, but the local locator's rendered text does not
independently match a saved street. Direct HTTP snapshots of both McDonald's
sources returned 403; primary web-tool readings supplied the limited corroboration.
These sources validate thresholds, not every cached brand count as a complete
current total. All audit inputs remain outside inference.

## All excluded controls

Every missed control is listed here. Unknown controls require review; this run
never changes their existing exclusion status.

| Control ID | Restaurant | Current decision | Signal |
| --- | --- | --- | --- |
| 8 | Fogo De Ciao | unknown | none |
| 13 | Porto's | unknown | none |
| 14 | Broken Yolk | unknown | none |
| 17 | Snooze | unknown | none |
| 69 | McDonald's | chain | S3+S1 |
| 102 | water grill | unknown | none |
| 112 | Avila's El Ranchito | unknown | none |
| 125 | Baja Fish Tacos | unknown | none |
| 137 | Maggiano's | unknown | none |
| 150 | Del taco | chain | S3+S1 |
| 180 | In-N-Out | unknown | none |
| 199 | Tokyo Central | unknown | none |
| 222 | Gens Korean bbq | unknown | none |
| 237 | Tokyo Central | unknown | none |
| 261 | Round Table | unknown | none |
| 262 | Dominoes | unknown | none |
| 267 | Papa John's | chain | S3+S1 |
| 316 | Old Spaghetti Factory | unknown | none |
| 335 | Avilas | unknown | none |
| 343 | Mountain Mikes | unknown | none |
| 378 | Round Table | unknown | none |
| 383 | In-N-Out | unknown | none |
| 389 | Sancho's Tacos | unknown | none |
| 399 | Del Taco | chain | S3+S1 |
| 473 | Chart House | chain | S3+S1 |
| 514 | zPizza | unknown | none |
| 516 | Fresh Brothers | unknown | none |
| 544 | Baja Fish Tacos | unknown | none |
| 550 | El Cholo | unknown | none |
| 562 | Sancho's Tacos | unknown | none |
| 563 | Baja Fish Taco | unknown | none |
| 567 | Veggie Grill | chain | S3+S1 |
| 568 | Avila's | unknown | none |
| 570 | El Cholo | unknown | none |
| 571 | Postino | unknown | none |
| 573 | PF Chang's | unknown | none |
| 574 | Panda Express | unknown | none |
| 601 | BJ's | unknown | none |
| 611 | Baja Fish | unknown | none |
| 621 | Chipotle | unknown | none |
| 671 | The Hat | unknown | none |
| 679 | The Hat | unknown | none |
| 717 | Sugarfish | unknown | none |
| 803 | Avila's Ranchito | unknown | none |
| 896 | Porto's | unknown | none |
| 926 | Din Tai Fung | unknown | none |
| 938 | L&L Hawaiian Barbecue | chain | S3+S1 |
| 1180 | Avila's El Ranchito | unknown | none |
| 1331 | Del Taco | unknown | none |
| 1332 | McDonalds | unknown | none |
| 1334 | Yard House | unknown | none |
| 1353 | Boiling Crab | unknown | none |
| 1354 | Mastros | unknown | none |
| 1358 | Water Grill | unknown | none |
| 1362 | El Cholo | unknown | none |
| 1377 | Din Tai Fung | unknown | none |
| 1379 | Mastro’s | unknown | none |
| 1381 | Texas de Brazil | unknown | none |
| 1382 | Cheesecake Factory | unknown | none |
| 1383 | Kura sushi | unknown | none |
| 1398 | Benihana | unknown | none |
| 1412 | The Capital Grille | unknown | none |
| 1413 | Seasons 52 | unknown | none |
| 1417 | Tony Romas | unknown | none |
| 1423 | Kings Fish House | unknown | none |
| 1429 | Nobu | unknown | none |

## F6 reconciliation

The first 31 probe names cover every distinct F6 name. Their original 4+ SoCal
flags are historical proxies; changing the threshold and scope does not turn
those flags into ground truth. The original 33-row cohort did not preserve all
duplicate row IDs. This is complete name-level reconciliation with current mapped
IDs, including every current disagreement and unresolved reference, rather than
an unsupported reconstruction of all historical row identities.

| F6 name | Current matching rows | Directory 6+ proxy | Worldwide policy reference |
| --- | --- | --- | --- |
| Taqueria de Anda | 539: unknown | True | positive lower bound |
| Aloha Stacks (Mr. Pete’s Burger) | 357: unknown | False | unverified |
| Pho 79 | 777: unknown | False | unverified |
| Ensenada’s Surf n’ Turf | 545: unknown | False | unverified |
| Moulin | 496: unknown | False | positive lower bound |
| Taquerias Guadalajara | 555: unknown | False | unverified |
| Pitfire | 34: unknown | None | positive lower bound |
| Polly's Pies Restaurant | 1199: chain | True | positive lower bound |
| Corky's | 1047: unknown | None | positive lower bound |
| Gus's World Famous Fried Chicken | 892: unknown | True | positive lower bound |
| Chronic tacos | 132: unknown | True | positive lower bound |
| Jugos Acapulco | 134: unknown | False | unverified |
| Polly's Pies | 1166: chain | True | positive lower bound |
| Eggroll King | 107: unknown | False | unverified |
| El Torito X | 548: unknown | True | positive lower bound |
| China Bowl Express | 1231: unknown | False | unverified |
| Las Golondrinas | 485: unknown | False | positive lower bound |
| Pedro's tacos | 375: unknown | False | unverified |
| Panda Inn | 575: unknown | True | positive lower bound |
| Bouillon | 927: unknown | None | unverified |
| Board and Brew | 398: unknown | True | positive lower bound |
| Taqueria Hoy | 1020: unknown | False | unverified |
| lucky Chinese food | 103: unknown | False | unverified |
| Seabirds | 1085: unknown | None | unverified |
| THH sandwiches & coffee | 857: unknown | False | positive lower bound |
| Breakfast Republic | 82: unknown | True | positive lower bound |
| Hong Kong Express | 111: unknown | True | unverified |
| Gaucho Grill | 16: unknown | False | unverified |
| Seasurf fish Co. | 371: unknown | False | unverified |
| TK Burger | 55: unknown | None | unverified |
| The Taco Stand | 148: unknown | True | positive lower bound |

## Five-to-seven-location checks

Independent public-source observations from the broad run on October 3 are reused
as a fixed reference, with every matching scorer decision recomputed below. They
were not fed to the models. These are address/operation checks, not a population
precision estimate or proof of exhaustive worldwide totals.

| Business | Independent observation | Current matching rows |
| --- | --- | --- |
| Kimmie's Coffee Cup | Five branches with hours listed. No explicit complete worldwide total. Six directory entries are not a verified chain count. [Source](https://www.kimmiescoffeecup.com/) | 11: unknown, 882: unknown, 1095: unknown |
| Moulin | Seven cafe/bakery listings collapse to six buildings. Newport bakery and cafe share 1000 Bristol Street N. All six have current hours. [Source](https://www.moulin.com/our-cafes/) | 496: unknown |
| Porto's | Six distinct pickup addresses. Five visible detailed sections plus Glendale in pickup selector. Do not count nationwide delivery as branches. [Source](https://www.portosbakery.com/locations/) | 13: unknown, 896: unknown |
| Las Golondrinas | Six distinct addresses. Five show hours, Talega explicitly requests calling for new hours. Official listing supports operation, no closure shown. [Source](https://lasgolondrinas.biz/locations/) | 485: unknown |
| Tacos Los Cholos | Official page explicitly states six current locations and marks Santa Ana and Eastvale NOW OPEN. Anaheim and Fullerton identities appear. Not treating similarly named Bandito row as verified affiliation. [Source](https://www.tacosloscholos.net/locations.html) | 186: unknown, 517: unknown |
| Rare Society | Six branch pages checked. Each shows operating hours and reservations. Las Vegas is open, not coming soon. [Source](https://raresociety.com/university-heights) | 361: unknown, 1351: unknown |
| Pizza Port | Six separately listed brewpub addresses. Excludes tasting room, Port Side and beer retail references. San Marcos ordering link alone is not counted. [Source](https://www.pizzaport.com/) | 376: unknown |

F6's additional sensitive cases remain explicit: THH has a supported seven-address
operating lower bound. TK's official index says five Orange County stores and
marks Anaheim Hills closed; a regional total does not prove a complete worldwide
negative. Las Golondrinas' sixth address is Talega, which asks visitors to call for
updated hours rather than stating closure. Their independently recorded sources
and limitations remain in `chain_probe_audits.json`.

## Deferred 62-probe comparison

The name/city-only comparison asks both models the same six-plus worldwide
question. It measures that weak lookup strategy separately from evidence-bundle
scoring. All requests completed without request errors, using exact caches when
available. Successful requests and usable answers are separate measures.

| Model | All-probe answers | All-probe abstentions | Policy-positive recall | Zero-confidence raw answers |
| --- | --- | --- | --- | --- |
| jev | 62/62 | [] | 3/15 | not requested |
| gemma | 60/62 | [6, 27] | 4/15 | [1, 6, 15, 18, 19, 27, 28, 37, 38, 55, 57] |

The policy reference has 15 positive lower bounds, 47 unresolved items and **zero
verified negatives**. Both models answer all 15 positives; conditional recall is
therefore the same as overall positive recall. Jev answers all 47 unresolved
probes and Gemma answers 45/47. These references cannot estimate false-positive
precision. Gemma's two abstentions are probes 6 and 27. Its eleven zero-confidence
responses contain nine raw false booleans and those two abstentions; no raw true
answer has zero confidence. Raw false booleans still count as answers, not verified
independence. The complete comparison artifact lists all 62 answers, confidence
values, reference bases and disagreements. Directory proxy agreement remains
separate from the supported policy comparison.

## Publisher-semantic pilots and stop decision

Three file-only lanes evaluated the same 40 frozen cases: 32 real pages/bundles
and eight synthetic controls. No database access or scorer-code change occurred.
Questions/prompts were frozen before calls. Blinded reviewer packets excluded
model outputs, probabilities, prior accepted flags and source-selection cohorts.
An aborted initial review of the unblinded preparation packet was not used.
These are independent same-session reference checks, not cross-vendor validation.

| Lane | Requests | Accepted | Reported new API cost | Finding |
| --- | ---: | ---: | ---: | --- |
| Jev, two conditions at unchanged 0.95 | 40 | 0 | $0.001848966 | Fails positive recovery; 26 publisher probabilities are unsure. No threshold relaxation or manual override. |
| Gemma, selected quote only | 40 | 4 | $0.00114612 | Seven substantive/33 insufficient quotes agree with the initial blinded quote reference; selected quotes retain only four grounded publisher cases. Small fixed set, not production precision. |
| Gemma, stronger full-source extraction then quote judgment | 80 | 8 | $0.00551634 | Three accepted quotes fail substantive operator attribution; two accepted publishers remain ambiguous. Unsuitable for automatic exclusions. |

The stronger lane misreads Mastro's food-risk boilerplate, Hickory & Spice's cook
biography and Olive Pit's 2008 founders as current operator proof. The three quote
errors and two ambiguous publishers overlap; they must not be summed into five
proven false-positive entities. Six of eight accepted whole sources have positive
publisher references, but that does not validate their selected quotes. Both
synthetic positive local quotes are invented or joined and correctly rejected by
exact-containment checks. All 160 pilot requests complete without request errors.
No numeric confidence was requested for the Gemma lanes; answer abstentions and
proof rejections are reported instead of invented confidence coverage.

The second blinded pass labels 10/40 quotes substantive and 30 insufficient;
whole-source attribution is 11 supported, six third-party and 23 ambiguous. It
clarifies that invitations/app/contact boilerplate alone do not prove publisher
operation, changing five earlier positive publisher references to ambiguous.
Both references and the five criterion changes are retained. That criterion
change and shared selection prevent claiming a pristine independent benchmark
or a general precision percentage. The pilots answer whether these prompt
alternatives are ready; they are not. Further prompt tuning is not a prerequisite
for accepting #200's evaluation result.

## Reproduction and #201 handoff

Private current artifacts: `output/chain-scorer/issue-200/acceptance-20261003/`.
They include the frozen-acquisition provenance, current deterministic/pre-Gemma/
final rows, fresh per-row checkpoints, final JSON/JSONL, all seven table
fingerprints, model requests/responses, complete comparison, control misses,
F6 reconciliation, reused boundary references and separate deterministic audit.
`analysis.json`, `safety-and-source-pins.json` and `reproduction-dependencies.json`
pin the artifact/source inputs. Publisher pilots and both blinded references live
in sibling `publisher-semantic-pilot-20261003/`, with their own dependency hashes.
These ignored artifacts include real source text and must remain private.


| Final artifact | SHA-256 |
| --- | --- |
| results.json | `63f078494802ae38e857bffdf12e409aaa95fa6692fec477d413f04cbf7db7a6` |
| results.jsonl | `b9dface7fec73d02cca444c9a4ce9d5573679aeb259121c10eb7743ddfe388ba` |
| summary.json | `5f6c110119445178258c9f4b0e2364f74444e81d3de78657e0d1b851dcc562c6` |
| comparison.json | `37efe8b3073d538f08671cbe68c90e9d16510eeabd9d6c32a60f1af3155cdda0` |

Replay requires the pinned dump, explicit SELECT-only scratch reader, source cache
`/private/tmp/ocfr200-cache`, frozen broad acquisition and model-cache inputs, the
hosted adapter, current scorer commit and private credential-recovery setup.
The artifact folder alone is not a standalone public reproduction package.
Never substitute an older scorer checkout or load the production environment.

```sh
python output/chain-scorer/issue-200/acceptance-20261003/run_openrouter.py --workers 8
python output/chain-scorer/issue-200/acceptance-20261003/analyze_results.py
```

For #201: preserve D1's six-location worldwide rule and D2's visible unknowns;
preserve human-reviewed exclusions; keep visitor reports private until reviewed;
use only independently supported evidence for new automatic exclusions. The two
active deterministic decisions are verified for this snapshot. A general
S3+S1 rule still needs bounded identity/count checks and tests for wrong same-name
businesses, nearby locations and unsupported branch categories. S4/S5/S6 should
remain advisory until separately validated; their model calls need not block
integration of the proven subset. Run a scratch dry run with exact expected
counts before any production mutation. Review/land this report and PR #219 before
closing #200, then complete #201 against the recorded precision decision.
