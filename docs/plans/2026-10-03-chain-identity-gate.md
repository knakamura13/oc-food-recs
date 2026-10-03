# Chain scorer: local identity gate

This addresses F1 from the [broad evaluation](2026-10-03-chain-broad-evaluation.md)
by adding a conservative prerequisite for source-derived counts. It does not
establish production precision or complete issue #200.

The evaluator now supplies the saved street to both models. A local anchor must
contain the saved numbered street and a separate city occurrence near that
street. The business name must be nearby or in the header of a verified official
page. Common street abbreviations and apostrophes are normalized, and comma-led
locality suffixes are separated from the saved street component. Repeated street
or business-name mentions cannot supply the city check.
Missing city, missing numbered street, unmatched spelling and insufficient source
context remain `unknown`.

Address lists require an anchored official S5 publisher. Other pages on the same
non-platform publisher domain may contribute branches. A third-party explicit
total requires the saved business name, street, city and matching count in one directly attributed sentence or listing. Unsupported phrasing abstains. A
local directory listing cannot license an unrelated address list elsewhere on
that page. These checks apply to S4/S5 counts and every S6 location source.
Official-source judgments and same-publisher affiliation remain assumptions that
need independent audit. This is a safety prerequisite, not complete affiliation
proof.

## Preserved-artifact replay

Replayed the final broad-run rows against the new validator and their complete
retrieved contexts, without acquisition, inference or database access. Existing
official-source judgments were preserved. The new street-aware prompts were
**not** evaluated by this replay.

| Measure | Before | After |
| --- | ---: | ---: |
| Active rows classified chain | 33 | 2 |
| Active rows classified unknown | 1,115 | 1,146 |
| Active rows classified independent | 0 | 0 |
| Four audited rejected identities classified chain | 4 | 0 |
| Fifteen audited supported lower bounds classified chain | 15 | 0 |
| Seven audited unresolved identities classified chain | 7 | 0 |

Cassidy's (60), Azteca (597), Navarros (643), and Huckleberry's (949) all become
`unknown`. The remaining two active chain decisions are the unchanged deterministic
S3+S1 Polly's Pies rows (1166 and 1199). Across active and control rows, 52 prior
chain decisions become unknown.

**Supported-case retention is 0/15.** Rejecting the four known mistakes while
abstaining on every audited positive does not demonstrate useful precision or
acceptable recall. Local anchors, official publisher evidence, abbreviated names
and saved addresses require further work before another production decision.

Private replay artifact:
`output/chain-scorer/issue-200/entity-identity-20261003/validator-replay.json`.
Input artifacts are from `broad-20261003`, with these SHA-256 hashes:

| Input | SHA-256 |
| --- | --- |
| `results.json` | `6296b1b9f4f5ce214b9c2ee85b32b88bea0fe85d0477688d1d976140f07db24a` |
| `contexts.json` | `907415842d24c2c891842e0718e9f90e241143c4a1d987e8a01b9075f4c07ddf` |
| `independent-classification-audits.json` | `fef1abb34937a7101235f7844985520345aa2753b58843c5c6357ec13c0e01ed` |

## Verification and next step

The initial draft passed 270 Python pipeline tests, including four wrong-business cases,
a model identity assertion contradicted by the saved address, a mixed-business
directory page, missing local fields, street abbreviations, city-named streets,
official publisher boundaries, positive explicit totals and repaired address lists.
Independent review found the initial same-page bypass, which was fixed and
reviewed again.

Keep #201 integration gated. Next, recover and independently verify local anchors
and publisher affiliation for the affected supported rows, then run the changed
street-aware prompts on that bounded cohort. Reassess retention and rejected
identities together before expanding evaluation or considering production use.

## Bounded hosted follow-up

Evaluated all 26 audited new flags and five selected controls using hosted
`typesafe/jev-1.13` and `google/gemma-4-31b-it`, with eight workers. Inputs used
preserved public source text plus 25 audit-informed reference URL hints. All 25
hint fetches returned usable text through the public extraction cache. No audit
classification or location-count labels were passed to either model. The URL
selection is curated, so this is not a blind acquisition benchmark.

The first automatic run evaluated 320 source pages and completed in 110 seconds
with no model errors. It still retained 0/15 supported flags. None of its local
publishers passed the unchanged 0.95 official-source threshold. An exploratory
narrow publisher calibration on eight local pages returned probabilities of
0.89–0.95. That does not establish a safe lower threshold, so the threshold and
production publisher question remain unchanged.

A fresh independent reviewer then assessed publisher identity from full public
page text without classifier decisions or chain-count audit labels. Of 18 input
items, 17 were judged first-party local pages and one was rejected as third-party.
The accepted items cover 13 saved rows, including two rows whose previously counted
businesses were wrong. Duplicate Prime Pizza and Moulin URL variants remain in
that item count. Every accepted quote and source hash was checked before applying
the annotations to a separate diagnostic lane.

The rejected Irvine Tasty Noodle House publisher explicitly disclaims restaurant
affiliation despite carrying the correct local address. Address matching alone
must not establish official publisher status.

The final paired run used identical source text, saved rows, prompts and validator
code. Only the reviewed lane's official-source annotations differed. The prompt
now preserves `publisher_identity_verified` for both initial and repair requests,
so an official local anchor outside the selected excerpts can authorize pages
from its publisher. The final validator still recomputes eligibility from the
complete source context.

| Measure | Automatic lane | Reviewed publisher-input lane |
| --- | ---: | ---: |
| Supported flags retained | 0/15 | 8/15 |
| Rejected identities incorrectly flagged | 0/4 | 0/4 |
| Unresolved identities flagged | 0/7 | 0/7 |
| Selected controls classified chain | 0/5 | 0/5 |

The reviewed lane recovers Pitfire (34), Mother's Market (38), The Taco Stand
(148), Pizza Port (376), Buona Forchetta (413), Birrieria Guadalajara (542), Tasty
Noodle House (793), and Gus's World Famous Fried Chicken (892), all through S6.
The prior count/category limitations for Mother's Market and Pizza Port still
apply. This 8/15 retention is conditional on reviewed publisher inputs, **not
automatic recall or a production precision estimate**. The annotations were used
only in the private diagnostic; no production annotation path was added.

Remaining supported misses:

| Saved row | Observed blocker |
| --- | --- |
| Chronic Tacos (132) | Model returned 25 entries, exceeding the 24-entry guard; no usable exact-quote windows remained for repair. |
| Prime Pizza (265) | Initial and repair location quotes failed exact containment. |
| BCD (329) | Saved street is a non-address phrase, so local identity remains unverified despite valid repaired locations. |
| Holdaak (333) | Saved `1201 Euclid St B` differs from the cited `1201 S Euclid St, Ste B`; direction and unit differences were not silently equated. |
| Rare Society (361) | Saved street is only `Del Mar`; the raw location quotes also failed containment. |
| Moulin (496) | Initial and repaired lists contain duplicate normalized building addresses. |
| El Torito X (548) | Saved name differs from the publisher's name, and address extraction/repair also failed. |

All five controls remain unknown. Porto's (13), Sugarfish (717), and Texas de
Brazil (1381) lack saved streets. The supplied control sources contain neither
Round Table's saved `2506 E Chapman Ave` nor Postino's saved `2981 Michelson Dr`.
No reviewed publisher annotation was supplied for these controls.

The paired run completed in 159 seconds. Both lanes completed all 31 rows without
request errors. There were 70 new successful hosted request-cache records after
exact reuse across the two lanes, costing $0.030132 in reported usage. Total
successful cached-response usage across the initial run, calibrations and paired
run was $0.074367. These totals do not include unmetered retries.

Private artifacts under `entity-identity-hosted-20261003` include the pinned
manifests, URL hints, acquired text, publisher review inputs and verdicts, paired
results, request caches, and row checkpoints. Neither lane accessed a database
or used local inference. The evaluated `chain_evaluate.py` SHA-256 is
`d027d2dd7c4ed6192929c1d81777b5d7948a14147b390461faa54cbbdede3f50`.

| Artifact | SHA-256 |
| --- | --- |
| `contexts.json` | `d48e86037c23f085886fb900a6828e8543e38ed63440c971d25470e5666385e8` |
| `publisher-review-input.json` | `0ac9773684b716ce97152b5691bf5dd94c09d04e488c8404f5b5d6bc4693e275` |
| `publisher-review.json` | `0921322f27def5ac96ba91fe9dda8d6f1ebeb3fb0a649fbd82d26184bc0bd1f6` |
| `paired/summary.json` | `e9132e483367c70e4d2207f730b3277a4de23964f78cb515775f446e776cfb5f` |

The updated Python pipeline suite passes 277 tests. Independent code review found
no actionable defect in the suffix, header, locality and prompt-verification
changes. Next, design and validate grounded publisher-ownership
evidence for the automatic lane, including unaffiliated pages and directories,
before expanding the cohort. Extraction and saved-address discrepancies remain
separate blockers. #200 and #201's production integration gate remain unresolved.

## PR review repairs

The mixed-directory count-quote bypass is closed by requiring a direct count
statement whose subject includes the saved name, street and separate city. The
accepted count must match that statement. Sentence/listing boundaries and unrelated
subjects cannot supply those fields. Common street-abbreviation periods are
preserved during boundary detection. A fake Jev response that validates both a
local three-location business and an unrelated six-location business still leaves
the saved restaurant unknown. A directly attributed local six-location statement
continues to pass.

The locality check excludes every matched business-name and street occurrence.
The exact review examples for Irvine Grill without a separate Irvine locality,
including an explicit Tustin locality, both fail. A distinct Irvine locality passes.

Replaying completed paired model outputs through these repaired guards changes
no decisions: automatic retention remains 0/15 and reviewed-input retention 8/15.
The zero-inference replay is preserved as `paired/post-review-validation.json`;
its repaired `chain_evaluate.py` SHA-256 is
`0721723ebbba0f73d0631d29e5e3f271332eda3b8750a0b49ed5b8d6733e7cac`.
The hosted results above retain their original code pin.
