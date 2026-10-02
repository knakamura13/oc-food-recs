# Issue #200 evaluation checkpoint

**Incomplete: preparation is finished; the full Gemma evidence fallback and final acceptance evaluation remain pending.** This checkpoint accompanies a draft PR. It does not authorize production exclusions or prove #200 complete.

Prepared from the specified Postgres 18 scratch restore with the scorer at `fb731f2`. Website extraction version 3 includes navigation links and footer evidence. No Gemma calls ran during this refresh. The human request to avoid long local Ollama jobs remains in effect.

## Provenance and read-only proof

- Input: `prod-pre-154-20261001T035812Z.dump`; SHA256 `f93ae84b892b299a73f7ca5f1a08802f23b807dc94257944c893058a1318910d`.
- Dedicated loopback scratch database; separate SELECT-only role; forced read-only transactions. Production `.env` was not loaded.
- Overture release `2026-09-23.1`; worldwide selection signature `fb0ad07d135d0f65f1ede6ea20f16aff4a4c67488ed6fd22e7029b734160fbdf`. The cached selection is a hash-verified superset of the current domain allowlist.
- NSI commit `d05c95cc4b36e3e2e66f29500d4bc0e7bf30dd7a`; 14 food-category files, 907 brand entries.
- All The Places run `2026-09-26-13-32-25`; archive SHA256 `836b9e7cc8e0bb89b74aa8e4c398a5c614ee550857560f27c5e95f7d66eec8c3`. Streamed 38,621,508 features; 480,270 food features, 1,974 brands, 45,246 relevant places. 19 malformed files recorded.
- 756 website cache entries, 116 fetch errors. 2,966 per-source Jev records, 0 request errors. Errors remain missing evidence.
- Seven public table fingerprints match before/after preparation:

| Table | Rows | SHA256 |
|---|---:|---|
| excluded_brands | 114 | `f22fc1768aaa5f09d31e6fc9d52d029d5ea9d64dfb42d46378434e48c5ac53fc` |
| geocode_cache | 1564 | `acad647c7f2c1594800314a581f9afa82bee175a4fb0c8fc1e32913f676fcca2` |
| mentions | 2379 | `fe3d88352869d29ae98bc00cb87d7e07760322897c64c9c5e4ec8104e68aaa54` |
| merge_log | 15 | `5dc02ee4a65885452bea70151648079f472c0a9e845c47b46888338214a73468` |
| restaurant_aliases | 18 | `fe39ebd0657a65144ada2cfeb1fa5fdc8fa38abadf703c6c39d2eae1fafa2f7a` |
| restaurants | 1224 | `73d72d25770a7129c94da247a0b035cffee0b0041a7e144b8482a64da221ee1f` |
| threads | 73 | `48af0cb594a85ba340ddcb6a35214c97f70bc588baa1064486cfe37f559acad6` |

## Provisional decisions and signals

These are S1–S5 preparation results before Gemma. Signal counts overlap. Observed counts below six are not verified worldwide totals.

| Cohort | Rows | Chain | Independent | Unknown |
|---|---:|---:|---:|---:|
| Active restaurants | 1148 | 23 | 0 | 1125 |
| Excluded-chain controls | 66 | 31 | 0 | 35 |

| Signal | Active | Controls |
|---|---:|---:|
| S1 | 23 | 23 |
| S2 | 0 | 10 |
| S3+S1 | 2 | 7 |

Control recall is **31/66 (47.0%)** at this stage. All 35 misses remain unknown:

| ID | Restaurant | City |
|---:|---|---|
| 8 | Fogo De Ciao | Brea |
| 13 | Porto's | Buena Park |
| 17 | Snooze | Orange |
| 125 | Baja Fish Tacos | Costa Mesa |
| 137 | Maggiano's | Costa Mesa |
| 199 | Tokyo Central | YL |
| 222 | Gens Korean bbq | Fullerton |
| 237 | Tokyo Central | Yorba Linda |
| 261 | Round Table | Fullerton |
| 262 | Dominoes | Fullerton |
| 335 | Avilas | Lake Forest |
| 378 | Round Table | San Clemente |
| 514 | zPizza | Tustin |
| 563 | Baja Fish Taco | Laguna Niguel |
| 568 | Avila's | Laguna Niguel |
| 570 | El Cholo | — |
| 571 | Postino | Irvine |
| 601 | BJ's | — |
| 611 | Baja Fish | — |
| 717 | Sugarfish | — |
| 803 | Avila's Ranchito | — |
| 896 | Porto's | — |
| 1331 | Del Taco | — |
| 1334 | Yard House | — |
| 1353 | Boiling Crab | — |
| 1354 | Mastros | Newport Beach |
| 1358 | Water Grill | — |
| 1379 | Mastro’s | — |
| 1381 | Texas de Brazil | — |
| 1383 | Kura sushi | — |
| 1412 | The Capital Grille | — |
| 1413 | Seasons 52 | — |
| 1417 | Tony Romas | — |
| 1423 | Kings Fish House | — |
| 1429 | Nobu | — |

## F6 comparison

F6 in #199 supplies 16 rows expected to remain flagged at six or more. The table uses the matched rows in this snapshot; ambiguous extra aliases are listed separately. Eleven are flagged in preparation, and five disagree by remaining unknown. Unknown does not assert independence.

| ID | Restaurant | Prepared decision | Largest observed count | F6 agreement |
|---:|---|---|---:|---|
| 548 | El Torito X | chain | 105 | yes |
| 111 | Hong Kong Express | chain | 60 | yes |
| 132 | Chronic tacos | chain | 59 | yes |
| 398 | Board and Brew | chain | 29 | yes |
| 1166 | Polly's Pies | chain | 14 | yes |
| 1199 | Polly's Pies Restaurant | chain | 14 | yes |
| 34 | Pitfire | unknown | unmatched | disagreement |
| 1047 | Corky's | unknown | unmatched | disagreement |
| 82 | Breakfast Republic | chain | 13 | yes |
| 148 | The Taco Stand | chain | 18 | yes |
| 539 | Taqueria de Anda | chain | 9 | yes |
| 1444 | Taqueria de Anda | chain | 9 | yes |
| 575 | Panda Inn | chain | 17 | yes |
| 485 | Las Golondrinas | unknown | 5 | disagreement |
| 857 | THH sandwiches & coffee | unknown | 5 | disagreement |
| 55 | TK Burger | unknown | unmatched | disagreement |

Additional ambiguous aliases: Hong Kong Express/Westminster (578) and taqueria de anda without a city (842) are unmatched and unknown. The two Polly’s Pies rows (1166/1199) and two city-specific Taqueria de Anda rows (539/1444) are shown explicitly. The original 33-row F6 query did not publish every row ID; this checkpoint does not invent that mapping.

## Boundary checks and precision concerns

Official websites were checked alongside the pinned directory counts. These are source checks, not exhaustive worldwide audits of every brand.

| Business | Directory observation | Official-site evidence | Implication |
|---|---|---|---|
| [TK Burgers](https://www.tkburgers.com/tk-burgers-locations/) | Current row unmatched; F6 previously counted 6 | Five current stores; Anaheim Hills has a separate closed-store page | The old sixth site is stale; current unknown is not a wrong independence decision. |
| [Moulin](https://www.moulin.com/our-cafes/) | 4 | Six distinct café addresses; the Newport bakery shares its café building | The old five-location premise and observed proxy undercount. Do not double-count the bakery. |
| [Las Golondrinas](https://lasgolondrinas.biz/locations/) | 5 | Six locations, including Talega | Directory undercount crosses the policy boundary. |
| [THH Sandwiches](https://www.thhsandwiches.com/locations) | 5 | Seven addresses with operating hours | Directory undercount crosses the policy boundary. |
| [Kimmie’s Coffee Cup](https://www.kimmiescoffeecup.com/) | 6; rows 11/882 flagged | Five listed addresses with hours | Counterexample requiring reconciliation before automatic S1 exclusions. |
| [Gina’s Pizza](https://ginaspizza.com/) | 7; row 1178 flagged | Three operating addresses plus Laguna Niguel marked coming soon; page also says four locations | Planned-site and stale-count concerns; current official list is below six. |

**S1 precision is not proven.** The domain assigned to Hong Kong Express/Tustin also [redirects to an airline](https://www.hkexpress.com/), invalidating its shared-domain reference. The Kimmie’s and Gina’s discrepancies prevent treating every prepared S1 flag as an approved automatic exclusion in #201. Model grounding constrains quoted evidence, but publisher identity, business identity and current operation still partly require model judgment.

## Deferred 62-item comparison checkpoint

Both models completed the same worldwide-six threshold question before the laptop restriction. This checkpoint reuses those saved responses; it did not run either model again. The bare-name comparison is diagnostic and is not a scorer decision.

Worldwide observed counts relabel 55 items: 11 positive proxies and 44 below-six proxies. Seven items stay unlabeled. The below-six proxy is **not verified independence**; the official Moulin, Las Golondrinas and THH checks already contradict three such proxies. These metrics therefore measure agreement with directory observations, not real-world policy accuracy. The reconciled policy references below correct these conflicts and retain unknown labels where coverage is missing.

| Model | Coverage on 55 labeled proxies | Recall, all 11 positive proxies | Overall agreement | Conditional agreement |
|---|---:|---:|---:|---:|
| Jev | 55/55 | 2/11 (18.2%) | 45/55 (81.8%) | 45/55 (81.8%) |
| Gemma | 53/55 | 3/11 (27.3%) | 46/55 (83.6%) | 46/53 (86.8%) |

Gemma abstentions 6/27 count as misses in overall metrics. Its conditional recall is 3/10 (30.0%). Zero-confidence false answers: 1, 15, 18, 19, 28, 37, 38, 55, 57. They are raw diagnostic outputs, not independence evidence.

Jev disagreement IDs: 1, 8, 11, 13, 15, 19, 26, 27, 28, 31.
Gemma disagreement/abstention IDs: 1, 6, 8, 11, 13, 15, 19, 27, 31.
Unlabeled IDs: 7, 9, 20, 24, 30, 55, 61.

### Reconciled worldwide policy references

`scripts/chain_probe_audits.json` pins public-source checks independently of both compared models. Moulin, Las Golondrinas and THH contribute six-plus operating-location lower bounds. Official pages also establish [at least six Pitfire addresses](https://www.pitfirepizza.com/location/costa-mesa/) and [13 Corky’s addresses with current hours](https://corkyskitchenandbakery.com/locations/), including their probe branches. Probe 27’s assigned domain redirects to an airline, so its restaurant identity is rejected as a reference. Probe 30’s official five-store statement is regional and cannot prove complete worldwide independence.

All 62 probes now have a policy reference field: **15 positive lower-bound references and 47 unknown**, with **zero verified negative references**. Ten positives still rely on directory identity/counts; they are not independently audited truth. Five positives have official-site address-list checks. Below-six directory observations never supply a negative policy label.

Jev recalls **3/15 (20.0%)** and Gemma **4/15 (26.7%)** on these positive references. Both recognized Pitfire and missed the other four official-list positives. Both answered all 15 labeled items. With no verified negative references, the set cannot establish false-positive performance or general policy accuracy. The older proxy agreement figures above remain diagnostic only.

Jev policy-reference disagreement IDs: 1, 5, 8, 9, 11, 13, 15, 17, 19, 25, 26, 31.
Gemma policy-reference disagreement IDs: 1, 5, 8, 9, 11, 13, 15, 17, 19, 25, 31.

| Probe | Restaurant | City | Worldwide observed count | Directory proxy | Policy reference | Reference basis | Jev P(6+) | Gemma answer | Gemma confidence |
|---:|---|---|---:|---|---|---|---:|---|---:|
| 1 | Taqueria de Anda | La Palma | 9 | True | 6+ | observed_worldwide_lower_bound | 0.2 | False | 0 |
| 2 | Aloha Stacks (Mr. Pete’s Burger) | Mission Viejo | 2 | False | unknown | unverified_worldwide_total | 0.16 | False | 1 |
| 3 | Pho 79 | Garden Grove | 5 | False | unknown | unverified_worldwide_total | 0.22 | False | 0.5 |
| 4 | Ensenada’s Surf n’ Turf | Fullerton | 4 | False | unknown | unverified_worldwide_total | 0.09 | False | 1 |
| 5 | Moulin | San Clemente | 4 | False | 6+ | official_operating_location_list | 0.25 | False | 1 |
| 6 | Taquerias Guadalajara | Anaheim | 3 | False | unknown | unverified_worldwide_total | 0.41 | unverified | 0 |
| 7 | Pitfire | Costa Mesa | unverified | unverified | 6+ | official_operating_location_list | 0.51 | True | 1 |
| 8 | Polly's Pies Restaurant | Santa Ana | 14 | True | 6+ | observed_worldwide_lower_bound | 0.22 | False | 1 |
| 9 | Corky's | Ladera Ranch | unverified | unverified | 6+ | official_operating_location_list | 0.47 | False | 1 |
| 10 | Gus's World Famous Fried Chicken | Santa Ana | 46 | True | 6+ | observed_worldwide_lower_bound | 0.72 | True | 1 |
| 11 | Chronic tacos | Costa Mesa | 59 | True | 6+ | observed_worldwide_lower_bound | 0.24 | False | 1 |
| 12 | Jugos Acapulco | Costa Mesa | 4 | False | unknown | unverified_worldwide_total | 0.24 | False | 0.5 |
| 13 | Polly's Pies | Fullerton | 14 | True | 6+ | observed_worldwide_lower_bound | 0.29 | False | 1 |
| 14 | Eggroll King | Huntington Beach | 3 | False | unknown | unverified_worldwide_total | 0.23 | False | 0.5 |
| 15 | El Torito X | Anaheim | 105 | True | 6+ | observed_worldwide_lower_bound | 0.37 | False | 0 |
| 16 | China Bowl Express | Fountain Valley | 5 | False | unknown | unverified_worldwide_total | 0.2 | False | 0.5 |
| 17 | Las Golondrinas | San Clemente | 5 | False | 6+ | official_operating_location_list | 0.34 | False | 1 |
| 18 | Pedro's tacos | San Clemente | 5 | False | unknown | unverified_worldwide_total | 0.17 | False | 0 |
| 19 | Panda Inn | La Palma | 17 | True | 6+ | observed_worldwide_lower_bound | 0.44 | False | 0 |
| 20 | Bouillon | Newport Beach | unverified | unverified | unknown | unverified_worldwide_total | 0.48 | False | 1 |
| 21 | Board and Brew | San Clemente | 29 | True | 6+ | observed_worldwide_lower_bound | 0.68 | True | 1 |
| 22 | Taqueria Hoy | Orange | 4 | False | unknown | unverified_worldwide_total | 0.25 | False | 1 |
| 23 | lucky Chinese food | Fountain Valley | 4 | False | unknown | unverified_worldwide_total | 0.23 | False | 0.5 |
| 24 | Seabirds | Costa Mesa | unverified | unverified | unknown | unverified_worldwide_total | 0.12 | False | 1 |
| 25 | THH sandwiches & coffee | Tustin | 5 | False | 6+ | official_operating_location_list | 0.15 | False | 1 |
| 26 | Breakfast Republic | Costa Mesa | 13 | True | 6+ | observed_worldwide_lower_bound | 0.33 | True | 1 |
| 27 | Hong Kong Express | Tustin | 60 | True | unknown | rejected_domain_identity | 0.37 | unverified | 0 |
| 28 | Gaucho Grill | Buena Park | 4 | False | unknown | unverified_worldwide_total | 0.86 | False | 0 |
| 29 | Seasurf fish Co. | San Clemente | 3 | False | unknown | unverified_worldwide_total | 0.09 | False | 1 |
| 30 | TK Burger | Costa Mesa | unverified | unverified | unknown | regional_total_not_worldwide | 0.17 | False | 0.9 |
| 31 | The Taco Stand | Costa Mesa | 18 | True | 6+ | observed_worldwide_lower_bound | 0.28 | False | 0.9 |
| 32 | Omelette House | Garden Grove | 1 | False | unknown | unverified_worldwide_total | 0.23 | False | 1 |
| 33 | Desert Moon Mediterranean Grill | Anaheim | 1 | False | unknown | unverified_worldwide_total | 0.11 | False | 1 |
| 34 | The Classic Cafe | Fullerton | 1 | False | unknown | unverified_worldwide_total | 0.15 | False | 1 |
| 35 | Three Monkeys | Huntington Beach | 1 | False | unknown | unverified_worldwide_total | 0.22 | False | 1 |
| 36 | guichos eatery | San Clemente | 3 | False | unknown | unverified_worldwide_total | 0.11 | False | 1 |
| 37 | California Tofu Grill | Fullerton | 1 | False | unknown | unverified_worldwide_total | 0.11 | False | 0 |
| 38 | Real Thai Food | Garden Grove | 1 | False | unknown | unverified_worldwide_total | 0.23 | False | 0 |
| 39 | Bowl and Plate Eatery | Anaheim | 1 | False | unknown | unverified_worldwide_total | 0.09 | False | 1 |
| 40 | Vietnam's Pearl | Costa Mesa | 1 | False | unknown | unverified_worldwide_total | 0.18 | False | 1 |
| 41 | Shenandoah At the Arbor | Los Alamitos | 1 | False | unknown | unverified_worldwide_total | 0.11 | False | 1 |
| 42 | Madero 1899 | Fullerton | 1 | False | unknown | unverified_worldwide_total | 0.21 | False | 1 |
| 43 | Globe Deli | Costa Mesa | 1 | False | unknown | unverified_worldwide_total | 0.19 | False | 1 |
| 44 | Kuramoto | Tustin | 1 | False | unknown | unverified_worldwide_total | 0.22 | False | 1 |
| 45 | Moreno's | Orange | 1 | False | unknown | unverified_worldwide_total | 0.27 | False | 0.5 |
| 46 | Wedge Burger | Costa Mesa | 1 | False | unknown | unverified_worldwide_total | 0.22 | False | 1 |
| 47 | Colony Wine Merchant | Anaheim | 1 | False | unknown | unverified_worldwide_total | 0.09 | False | 1 |
| 48 | California Vintage Wine Bistro | Anaheim | 1 | False | unknown | unverified_worldwide_total | 0.07 | False | 1 |
| 49 | Heaven on a Fork | Laguna Hills | 1 | False | unknown | unverified_worldwide_total | 0.14 | False | 1 |
| 50 | Sushi Pop | Fullerton | 1 | False | unknown | unverified_worldwide_total | 0.28 | False | 0.8 |
| 51 | Matty’s Patty’s Burger Club | Costa Mesa | 2 | False | unknown | unverified_worldwide_total | 0.24 | False | 1 |
| 52 | Pho Lu | Garden Grove | 1 | False | unknown | unverified_worldwide_total | 0.24 | False | 0.5 |
| 53 | Poppy & Seed | Anaheim | 1 | False | unknown | unverified_worldwide_total | 0.13 | False | 1 |
| 54 | Dunarea Restaurant | Anaheim | 1 | False | unknown | unverified_worldwide_total | 0.13 | False | 0.9 |
| 55 | M&M Donuts | Anaheim | unverified | unverified | unknown | unverified_worldwide_total | 0.29 | False | 0 |
| 56 | La Cave | Costa Mesa | 1 | False | unknown | unverified_worldwide_total | 0.19 | False | 1 |
| 57 | The Taco Shop | Anaheim | 1 | False | unknown | unverified_worldwide_total | 0.3 | False | 0 |
| 58 | Roma D' Italia | Tustin | 1 | False | unknown | unverified_worldwide_total | 0.24 | False | 0.9 |
| 59 | Ranch Enchilada | Yorba Linda | 2 | False | unknown | unverified_worldwide_total | 0.18 | False | 1 |
| 60 | Saigon Vegan | Garden Grove | 1 | False | unknown | unverified_worldwide_total | 0.15 | False | 1 |
| 61 | Ensenada market | La Palma | unverified | unverified | unknown | unverified_worldwide_total | 0.12 | False | 1 |
| 62 | Nick's deli | Los Alamitos | 2 | False | unknown | unverified_worldwide_total | 0.14 | False | 1 |

## Remaining acceptance work

- Resume local Gemma only after explicit human authorization; run evidence fallback on every unresolved row with the current prompt/output budget.
- Produce final `results.jsonl` and `summary.json` with one result per 1,148 active rows plus 66 controls; verify zero missing or duplicate IDs and unchanged table fingerprints.
- Finish final-cascade F6 reconciliation and report all 47 unverified worldwide probe references. Preserve coverage gaps rather than manufacturing negative truth.
- Replace provisional counts, recall/miss lists and F6 disagreements with final cascade outcomes; document all errors and model limitations.
- Decide which checks the evidence actually supports for #201. Keep #200 open until these requirements are verified.

## Validation

At `fb731f2`: 214 Python unit tests passed; `npm run test:pipeline` passed 210 tests; `git diff --check` passed. A focused independent review found no remaining material issue in the latest address-grounding and website-traversal changes. Model calls in unit tests were mocked. CI run [36964363748](https://github.com/knakamura13/oc-food-recs/actions/runs/36964363748) passed both check-and-test and e2e on checkpoint commit `58c3a6d`. The latest label-reconciliation change passes 221 Python unit tests and 217 package pipeline tests; all 62 probe answers were replayed strictly from exact cached requests, with no model calls. Audit metadata and decisive evidence bases received independent review. Full live Gemma acceptance remains unverified.

Raw source text, model responses and scratch credentials remain in ignored local artifacts. This committed checkpoint contains only restaurant names, aggregate findings, public source links and input fingerprints.
