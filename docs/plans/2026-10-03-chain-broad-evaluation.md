# Full scratch chain evaluation after #214

**Automatic production exclusions remain blocked.** The merged scorer flags more known chains, but the independent audit rejects or cannot verify 11 of its 26 new active flags. Grounded addresses alone do not verify affiliation to the saved restaurant. This report records the complete run and its failed precision gate. It does not promote the flagged rows or change production state.

## Inputs and execution

- Evaluator commit: `398c11efc1310ad8ffbebe30b2a51ea01c636432`, merged #214.
- Scratch cohort: 1,214 unique restaurant IDs, comprising 1,148 active rows and all 66 existing excluded-chain controls.
- Scratch restore: `prod-pre-154-20261001T035812Z.dump`, the same pinned restore used for prior issue #200 runs. Current backup SHA-256: `f93ae84b892b299a73f7ca5f1a08802f23b807dc94257944c893058a1318910d`.
- Every saved public-table fingerprint matched before and after. The original dump and production state were not modified.
- Automatic search and the merged bounded crawler supplied sources. No hand-picked business URLs or manual audit labels were injected into acquisition or inference.
- Hosted Gemma: `google/gemma-4-31b-it`, temperature 0, JSON output, reasoning disabled, provider price caps $0.09 input / $0.34 output per million tokens. Jev: `typesafe/jev-1.13`. No local inference ran.
- Private orchestration reuses exact cached responses and checkpoints each restaurant. Source acquisition and judging used 8 model workers, then fallback used the supported maximum of 16. Public retrieval used 16 workers.
- End-to-end execution took 16.04 minutes, including orchestration interruptions. Fallback processed all 1,205 unresolved rows in 200 seconds.
- Newly cached usage reports $0.58058: $0.34292 Jev and $0.23766 Gemma. Historical cache costs and incomplete retry metering are excluded. This is reported usage, not a reconciled account bill.

An independent runner review caught two orchestration issues before inference: unrestricted seed-page prefetch and checkpoint reuse after a failed repair. Prefetch network calls were removed, and checkpoints now inspect errors in every attempt. The restarted crawler admitted 3,473 requests and retained 3,470 pages across 1,076 publishers. Its limits apply to that restarted crawl. The earlier interrupted prefetch inspected at least 1,625 of 1,757 starting URLs outside those counters, with network/cache proportions not recorded. Sitemap requests are also outside page admission counts. The extra prefetch is disclosed rather than described as bounded.

Acquisition had 616 page errors. Search returned candidate URLs for 184 of 1,214 rows. Existing directory hints were retained according to the merged ranking rules. All 6,623 source judgments completed without request errors. The pinned ATP input still reports 19 parse errors, so its coverage remains incomplete.

## Raw scorer results

| Cohort | Chain | Verified independent | Unknown |
| --- | ---: | ---: | ---: |
| Active, 1,148 rows | 33 | 0 | 1,115 |
| Excluded-chain controls, 66 rows | 28 | 0 | 38 |

Active signals: 31 S6 and 2 S3+S1. Control signals: 21 S6 and 7 S3+S1. No S2, S4 or S5 signal independently reached the supported decision threshold. The 33 active flags are raw scorer decisions, not 33 independently verified chains.

Control recovery increased from 15/66 (22.73%) in `fresh-20261003/evaluation-openrouter` to 28/66 (42.42%). These are legacy exclusion controls, not a newly audited worldwide-policy truth set. Recovery is useful regression evidence but does not establish policy precision. All five selected controls from #214 are still recovered: Porto's, Round Table, Postino, Sugarfish and Texas de Brazil.

Gemma attempted one repair on 68/1,205 rows (5.64%). Twenty-one repaired rows ended as chain, without implying those identities are independently correct. Median recorded repair latency was 2.17 seconds and mean was 3.95 seconds. Complete repair prompts were at most 5,887 UTF-8 bytes, within the 5,888-byte limit. No initial or repair request errors remained. One initial request, Mother's Market, retried a length-limited hosted response with 4,096 output tokens. Repair requests retained the normal 2,048-token output allowance.

### Every missed control

| ID | Restaurant | Final decision |
| --- | --- | --- |
| 8 | Fogo De Ciao | unknown |
| 17 | Snooze | unknown |
| 102 | water grill | unknown |
| 112 | Avila's El Ranchito | unknown |
| 180 | In-N-Out | unknown |
| 199 | Tokyo Central | unknown |
| 222 | Gens Korean bbq | unknown |
| 237 | Tokyo Central | unknown |
| 262 | Dominoes | unknown |
| 316 | Old Spaghetti Factory | unknown |
| 335 | Avilas | unknown |
| 343 | Mountain Mikes | unknown |
| 383 | In-N-Out | unknown |
| 514 | zPizza | unknown |
| 544 | Baja Fish Tacos | unknown |
| 550 | El Cholo | unknown |
| 563 | Baja Fish Taco | unknown |
| 568 | Avila's | unknown |
| 570 | El Cholo | unknown |
| 601 | BJ's | unknown |
| 611 | Baja Fish | unknown |
| 621 | Chipotle | unknown |
| 671 | The Hat | unknown |
| 679 | The Hat | unknown |
| 803 | Avila's Ranchito | unknown |
| 926 | Din Tai Fung | unknown |
| 1180 | Avila's El Ranchito | unknown |
| 1331 | Del Taco | unknown |
| 1332 | McDonalds | unknown |
| 1334 | Yard House | unknown |
| 1358 | Water Grill | unknown |
| 1362 | El Cholo | unknown |
| 1377 | Din Tai Fung | unknown |
| 1382 | Cheesecake Factory | unknown |
| 1412 | The Capital Grille | unknown |
| 1413 | Seasons 52 | unknown |
| 1417 | Tony Romas | unknown |
| 1423 | Kings Fish House | unknown |

### Regressions against the previous full run

85c Bakery (50), Tacos Los Cholos (186 and 517), In-N-Out (180 and 383), and Mountain Mikes (343) changed from chain to unknown. More retrieval did not uniformly improve recall. These six regressions are preserved in the artifacts and require source/prompt inspection. Unknown remains public under the approved policy.

## Independent audit of all 26 new active flags

Fifteen have independently supported six-location lower bounds. Four are rejected identity/category matches. Seven remain unresolved, including a cross-publisher count and rows without local identity fields. No unresolved record was relabeled independent. The 15/26 supported fraction is an audit outcome, not a binary precision estimate: unresolved rows are not verified negative labels.

| ID | Restaurant | Audit | Supported lower bound | Evidence and limitation |
| --- | --- | --- | ---: | --- |
| 34 | Pitfire | supported | 6 | Official Pitfire branch pages include the saved Costa Mesa address and six distinct operating addresses. [Source](https://www.pitfirepizza.com/location/costa-mesa/) |
| 38 | Mother's Market | supported count overstated | 7 | Official listing identifies saved Costa Mesa address and seven expressly open cafes. Scorer counted twelve store addresses, which does not prove twelve restaurant/cafe branches. [Source](https://www.mothersmarket.com/locations/) |
| 60 | Cassidy's | rejected identity | unverified | Saved 2603 Newport Blvd belongs to Cassidy Bar & Grill. The eight counted addresses belong to Cassidy Corner Cafe. No affiliation evidence. [Source](https://cassidys.us/) |
| 132 | Chronic tacos | supported | 7 | Official Chronic Tacos locator includes saved 1460 Baker St Costa Mesa and the seven operating addresses counted. [Source](https://www.chronictacos.com/locations/cat_menu) |
| 148 | The Taco Stand | supported | 6 | Official Taco Stand pages identify saved Costa Mesa Bristol address and six distinct restaurant branches. [Source](https://www.letstaco.com/locations) |
| 207 | Baekjeong | unresolved cross publisher | unverified | Count combines five US Baekjeong addresses with one Canadian Baekjeong address. US official publisher anchors Buena Park. No source establishes Canadian business affiliation, so the sixth entry cannot currently be accepted. [Source](https://www.baekjeongkbbq.com/book-your-reservation/) |
| 265 | Prime Pizza | supported | 7 | Official Prime Pizza locator anchors saved 235 E Imperial Hwy Brea and at least seven distinct currently operating addresses. Future openings excluded. [Source](https://primepizza.com/locations) |
| 329 | BCD | supported | 6 | Official BCD locator anchors Buena Park at 5321 Beach Blvd and lists at least six operating branches with hours. [Source](https://www.bcdtofuhouse.com/locations) |
| 333 | Holdaak | supported | 8 | Directly read current fetched official homepage. Fullerton 1201 S Euclid Ste B anchors identity. Eight branch addresses show hours. Live web-tool follow-up timed out, so use saved HTTP extraction as evidence. [Source](https://holdaak.com/) |
| 361 | Rare Society | supported | 6 | All six official Rare Society branch pages checked. San Clemente Avenida Del Mar anchors identity. Las Vegas shows current hours and reservations. [Source](https://raresociety.com/san-clemente) |
| 376 | Pizza Port | supported | 6 | Six brewpub addresses verified on official homepage including saved San Clemente address. Scorer reports seven including San Marcos Port Side, which was not independently counted as a brewpub. [Source](https://www.pizzaport.com/) |
| 413 | Buona Forchetta | supported | 6 | Official San Clemente page anchors saved address, explicitly calls it the sixth location, shows hours and links other operating restaurants. [Source](https://buonaforchettasd.com/location/san-clemente/) |
| 496 | Moulin | supported | 6 | Official cafes page has six distinct buildings. Newport cafe and bakery duplicate 1000 Bristol St N. San Clemente 120 Avenida Pico anchors identity. [Source](https://www.moulin.com/our-cafes/) |
| 538 | Tacos Guelaguetza | unresolved saved identity | unverified | Evidence is a Milwaukee Restaurant Guelaguetza group with food trucks. Saved target is Tacos Guelaguetza in Anaheim with no street. Supplied sources do not establish that these are the same business. [Source](https://restaurantguelaguetza.com/) |
| 542 | Birrieria Guadalajara | supported | 7 | Directly read current fetched official locator. Saved 1750 W Lincoln Ave Anaheim is listed, with seven distinct addresses and hours. Live web-tool request failed. [Source](https://www.birrieriaguadalajara.com/locations) |
| 548 | El Torito X | supported closed local branch | 6 | Official El Torito Anaheim page anchors saved 2020 E Ball Rd but states Temporarily Closed. Other six named branches show operating details. Chain affiliation is supported, local opening state requires separate review. [Source](https://www.eltorito.com/location/anaheim/) |
| 577 | Tasty Noodle House | unresolved saved identity | unverified | Official Tasty Noodle House list supports seven branches. Saved row has no city or street, so exact local entity cannot be independently anchored. [Source](https://www.tastynoodlehouse.us/order-now) |
| 597 | Azteca | rejected identity | unverified | City of Garden Grove identifies Azteca Restaurant & Lounge at saved 12911 Main St. Scorer cites a Washington restaurant chain with no demonstrated affiliation. [Source](https://ggcity.org/bigg/azteca-restaurant-lounge) |
| 631 | Puesto | unresolved saved identity | unverified | Official Puesto sources support at least six current branches. Saved row has no city or street, leaving exact local entity unanchored. [Source](https://www.eatpuesto.com/all-locations/) |
| 643 | Navarros | rejected identity and category | unverified | Official Navarro Taqueria contact page anchors saved Santa Ana address and three local branches. Scorer counted Miami Navarro Discount Pharmacy addresses. Three listed restaurants are not a verified worldwide negative. [Source](https://www.navarrostaqueria.co/contact-us/) |
| 793 | Tasty Noodle House | supported | 7 | Official Tasty Noodle House list anchors saved 15333 Culver Dr Irvine and seven pickup restaurant addresses. [Source](https://www.tastynoodlehouse.us/order-now) |
| 885 | Panini Kabob Grill | unresolved saved identity | unverified | Official Panini Kabob Grill locator confirms a large operating brand and OC branches. Saved row lacks city and street. Exact row affiliation remains unverified in this audit. [Source](https://paninikabobgrill.com/locations/) |
| 892 | Gus's World Famous Fried Chicken | supported | 6 | Official Gus Santa Ana page anchors 102 N Sycamore St. Official pages list six distinct currently operating restaurant branches. [Source](https://www.gusfriedchicken.com/locations/santa-ana-california) |
| 949 | Huckleberry's | rejected identity | unverified | Saved 15891 Gothard St is Huckleberry Famous Sandwich, identified in current menu and historical city visitor directory. Scorer counted the separate Huckleberry Southern Cookin franchise. No affiliation source. [Source](https://www.allmenus.com/ca/huntington-beach/799555-huckleberrys-famous-sandwich/menu/) |
| 1340 | Shin Sen Gumi | unresolved saved identity | unverified | Official Shin-Sen-Gumi footer lists multiple named restaurants, but the extracted count also includes Piano Lounge Courage. Saved row has no city or street. Brand count and saved identity need separate verification. [Source](https://shinsengumigroup.com/locations/alhambra/) |
| 1376 | Handel’s Ice cream | unresolved saved identity | unverified | Official Handel locator supports numerous operating ice cream shops. Saved row has no city or street, preventing an independent local entity anchor. [Source](https://handelsicecream.com/stores/) |

**F1 (wrong business identity):** Cassidy's at 2603 Newport Blvd was counted using Cassidy's Corner Cafe addresses. Navarros at 1535 S Standard Ave was counted using Navarro Discount Pharmacy in Miami. Azteca in Garden Grove and Huckleberry's Famous Sandwich in Huntington Beach were also assigned other same-name businesses. The S6 model's `identity_verified` assertion currently suffices even when the page judgment does not establish that publisher as the official source for the saved entity. A local entity anchor and branch affiliation proof must precede a supported count.

**F2 (mixed publishers and branch categories):** Baekjeong crosses five US addresses with a Canadian publisher to reach six without supplied affiliation proof. Mother's Market counts all twelve stores although the independent source reading establishes seven expressly open cafes. Shin-Sen-Gumi includes Piano Lounge Courage in the extracted eight. Counting the right kind of branch and reconciling publisher ownership needs its own evidence.

**F3 (retrieval regressions):** Tacos Los Cholos is independently confirmed at six current locations but both active rows abstain. Three other businesses also regress across six total rows. Fixing retrieval/selection must preserve the precision requirements rather than relaxing address grounding.

### Five-to-seven boundary checks

| Business | Independent observation | Scorer |
| --- | --- | --- |
| Kimmie's Coffee Cup | Five branches with hours listed. No explicit complete worldwide total. Six directory entries are not a verified chain count. [Official source](https://www.kimmiescoffeecup.com/) | 11: unknown, 882: unknown, 1095: unknown |
| Moulin | Seven cafe/bakery listings collapse to six buildings. Newport bakery and cafe share 1000 Bristol Street N. All six have current hours. [Official source](https://www.moulin.com/our-cafes/) | 496: chain |
| Porto's | Six distinct pickup addresses. Five visible detailed sections plus Glendale in pickup selector. Do not count nationwide delivery as branches. [Official source](https://www.portosbakery.com/locations/) | 13: chain, 896: chain |
| Las Golondrinas | Six distinct addresses. Five show hours, Talega explicitly requests calling for new hours. Official listing supports operation, no closure shown. [Official source](https://lasgolondrinas.biz/locations/) | 485: chain |
| Tacos Los Cholos | Official page explicitly states six current locations and marks Santa Ana and Eastvale NOW OPEN. Anaheim and Fullerton identities appear. Not treating similarly named Bandito row as verified affiliation. [Official source](https://www.tacosloscholos.net/locations.html) | 186: unknown, 517: unknown |
| Rare Society | Six branch pages checked. Each shows operating hours and reservations. Las Vegas is open, not coming soon. [Official source](https://raresociety.com/university-heights) | 361: chain, 1351: chain |
| Pizza Port | Six separately listed brewpub addresses. Excludes tasting room, Port Side and beer retail references. San Marcos ordering link alone is not counted. [Official source](https://www.pizzaport.com/) | 376: chain |

These seven checks include a five-branch unverified total, six-address lower bounds, and Moulin's seven listings collapsing to six buildings. Pizza Port's six brewpub addresses establish the policy threshold without relying on the additional San Marcos entry. They do not create verified worldwide negatives.

## F6 reconciliation and deferred comparison

The first 31 probe names represent the distinct-name F6 list from #199. The table reports the current mapped restaurant row, current observed worldwide proxy and separately supported policy reference. The historical 33-row list did not preserve all original duplicate-row IDs in this probe input, so this is name-level reconciliation, not a claim to reconstruct every historical row. Directory proxies are not entity truth.

| F6 name | Current row and decision | Directory 6+ proxy | Policy label |
| --- | --- | --- | --- |
| Taqueria de Anda | 539: unknown | True | True |
| Aloha Stacks (Mr. Pete’s Burger) | 357: unknown | False | unverified |
| Pho 79 | 777: unknown | False | unverified |
| Ensenada’s Surf n’ Turf | 545: chain | False | unverified |
| Moulin | 496: chain | False | True |
| Taquerias Guadalajara | 555: unknown | False | unverified |
| Pitfire | 34: chain | None | True |
| Polly's Pies Restaurant | 1199: chain | True | True |
| Corky's | 1047: unknown | None | True |
| Gus's World Famous Fried Chicken | 892: chain | True | True |
| Chronic tacos | 132: chain | True | True |
| Jugos Acapulco | 134: unknown | False | unverified |
| Polly's Pies | 1166: chain | True | True |
| Eggroll King | 107: unknown | False | unverified |
| El Torito X | 548: chain | True | True |
| China Bowl Express | 1231: unknown | False | unverified |
| Las Golondrinas | 485: chain | False | True |
| Pedro's tacos | 375: unknown | False | unverified |
| Panda Inn | 575: unknown | True | True |
| Bouillon | 927: unknown | None | unverified |
| Board and Brew | 398: unknown | True | True |
| Taqueria Hoy | 1020: unknown | False | unverified |
| lucky Chinese food | 103: unknown | False | unverified |
| Seabirds | 1085: unknown | None | unverified |
| THH sandwiches & coffee | 857: chain | False | True |
| Breakfast Republic | 82: unknown | True | True |
| Hong Kong Express | 111: unknown | True | unverified |
| Gaucho Grill | 16: unknown | False | unverified |
| Seasurf fish Co. | 371: unknown | False | unverified |
| TK Burger | 55: unknown | None | unverified |
| The Taco Stand | 148: chain | True | True |

All 62 threshold-question comparisons completed for both models with no request errors, reusing exact cached requests where available. The supported policy reference has 15 positive labels and **zero verified negative labels**. Jev answers 3/15 positives correctly (20.00% recall) and Gemma 4/15 (26.67%). The other 47 references remain unlabeled. False-positive performance and policy precision cannot be estimated from this reference.

| Model | Disagreements with positive policy labels, probe IDs |
| --- | --- |
| jev | 1, 5, 8, 9, 11, 13, 15, 17, 19, 25, 26, 31 |
| gemma | 1, 5, 8, 9, 11, 13, 15, 17, 19, 25, 31 |

The weaker directory reference labels 55 items and leaves seven unlabeled. Its model metrics remain in `comparison.json`, separately from policy metrics. Neither a low observed count nor a zero-confidence false answer supplies a verified negative policy label.

## Private artifacts and replay

Artifacts are preserved in the primary checkout at `output/chain-scorer/issue-200/broad-20261003`. The final classification audit and boundary notes are separate from model outputs and were not fed back into this run. No Reddit bodies or handles are included in this report.

```sh
python output/chain-scorer/issue-200/broad-20261003/run_openrouter.py --workers 16
```

This machine-specific runner requires the saved scratch reader setup and `OPENROUTER_API_KEY_OC` in a fresh login shell. It pins the evaluator commit, script hashes and scratch fingerprint before reusing checkpoints. Replaying after a documentation commit requires pointing its `CODE` at an isolated checkout of the evaluator commit above. Preserve the historical directory and use a new output directory for changed scorer or source inputs. The runner, page snapshots and cached requests are private evaluation artifacts, not a portable production command.

| Artifact | SHA-256 |
| --- | --- |
| `results.json` | `6296b1b9f4f5ce214b9c2ee85b32b88bea0fe85d0477688d1d976140f07db24a` |
| `results.jsonl` | `c3d97f1649173d30d072160de09903d296888cbd6125494d96b45f2359e863c9` |
| `websites.json` | `6ea8f8b2f71f2db7bfceece7a203caeff27b90e09377cb7c7361ae199ae4efcd` |
| `contexts.json` | `907415842d24c2c891842e0718e9f90e241143c4a1d987e8a01b9075f4c07ddf` |
| `gemma-results.json` | `7cd6234a2881fd1c04683962ff9af61f43371d75cde3ed2be5d3806e28a24390` |
| `summary.json` | `b1646ba417a8d93a75c03a0e25872209d51b2de0cdcb1df93434683ba3392c98` |
| `comparison.json` | `37efe8b3073d538f08671cbe68c90e9d16510eeabd9d6c32a60f1af3155cdda0` |
| `independent-classification-audits.json` | `fef1abb34937a7101235f7844985520345aa2753b58843c5c6357ec13c0e01ed` |
| `independent-boundary-checks.json` | `60fc0f4cf35c37735ba00cb58fe45e0f1e1cf955f8d466a396d88d09d1d26465` |
| `run_openrouter.py` | `0103341a4707fcec685c4d44fb67643a961018707c70d9a6745a79cae2079bd4` |

Next: address F1 before considering production integration, then resolve F2 and inspect the six F3 regressions using the preserved sources. Repeat the affected cases and a broader precision sample against the same cohort. Issue #200 remains open because entity precision and the fully audited comparison truth set are unresolved. #201's automatic-exclusion integration remains gated.
