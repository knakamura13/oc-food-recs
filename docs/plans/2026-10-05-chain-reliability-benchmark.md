# Chain reliability benchmark groundwork

The current production seed registry matches **66/66 historical excluded-chain control names**. The separate research scorer recovered **7/66** in its accepted run. Neither result establishes how many currently visible businesses fall outside the site's intended mom-and-pop policy. The former tests a curated known-name registry; the latter tests automatic evidence recovery on a selected historical cohort.

## Frozen inputs and measured baseline

Measured offline on October 5 against source commit `ab4d4b1dacfbf21e534f1f0aa26a1ce80dd6acb0`. The control IDs/names and historical research decisions come from the [final acceptance report](2026-10-03-chain-final-acceptance.md), lines 144–209. Its scratch restore SHA-256 is `f93ae84b892b299a73f7ca5f1a08802f23b807dc94257944c893058a1318910d`; no restore/database was opened for this measurement.

The run executes the exact pinned `match_excluded_brand` and its six helper functions, plus the exact pinned `seed_exclusions.load_seed`. AST extraction avoids importing pipeline/database modules or reading `.env`; the environment is cleared. The source hashes, runtime version, complete row outcomes and runner are saved privately in the primary checkout's ignored `output/automation-audit/chain-benchmark/`. No database, model or acquisition calls ran, and no restaurant source bodies were read or sent anywhere.

| Measurement | Result | Meaning |
| --- | ---: | --- |
| Seed rows / loaded distinct normalized rows | 110 / 110 | Current committed seed configuration, excluding any extra live/admin registry entries |
| Seed reasons | 106 chain / 4 corporate group | Configuration categories; not independent factual adjudication |
| Historical control IDs | 66 | Existing excluded-chain proxies; no universal factual ground truth inferred |
| Distinct literal / normalized control names | 54 / 51 | Repeated branches and spelling variants are not independent observations |
| Candidate brand groups | 45 | Conservative manual alias constraints for future splitting; not proof of entity identity |
| Production seed matches | 66/66 (100%) | All return `chain`; no control-name misses in this bounded cohort |
| Historical research scorer matches | 7/66 (10.61%) | Recorded separate cascade result, not a new scorer run or production recall |
| Corporate seed contract cases | 4/4 | Vox Kitchen, Nep Cafe, Sup Noodle Bar, Crawfish and Noodles return `corporate_group`, Kei Concepts |
| Invented unrelated-name collision challenges | 7/9 rejected | Two prefix collisions accepted; synthetic mechanism evidence only |
| Newly adjudicated factual / verified negative labels | 0 / 0 | This groundwork establishes no real-business precision estimate |

No missed control aliases need repair in this cohort. Examples actually covered include `Fogo De Ciao`, `Gens Korean bbq`, `Round Table`, `Avilas`, `Baja Fish`, `McDonalds` and `Mastro’s`. Preserve these as regression controls rather than adding redundant aliases. The seed file's old note describes a 0.85 fuzzy score, but the implemented matcher uses exact normalization and guarded word-boundary matches, not that score (`scripts/reddit_pipeline.py:2517–2568`).

The synthetic fixtures stipulate that `Nobu Neighborhood Kitchen` and `Chipotle Corner Cafe` are invented unrelated entities. Both match the corresponding leading single-word seed brand. These expose the limits of name-only matching; they are **not two observed false exclusions of real restaurants**. The other seven challenges cover generic fragments and a seed name appearing away from the beginning. No synthetic case may enter the factual precision denominator.

## Reference and split rules frozen before retrieval changes

`controls.json` retains all 66 IDs, exact historical names, reference line, research decision, effective seed brand, every matching seed alias, and the candidate grouping. Every control starts with factual label `unadjudicated`. `brand-groups.json` has 45 candidate groups; 14 groups contain multiple rows. In particular, all five Avila variants stay together, as do four Baja Fish variants and both Mastro variants. A disagreement about grouping must be recorded and resolved before splitting; do not distribute ambiguous siblings across sets.

The historical controls are regression/development cases because their names already occur in the registry and published investigation. They cannot supply an unseen-brand discovery holdout. Likewise, the existing 62-probe comparison has fifteen positive reference lower bounds, forty-seven unresolved cases and zero verified negatives; it is historical evidence rather than a fresh independent benchmark. The private reference artifact additionally freezes all seven explicit committed `chain_probe_audits.json` records: five dated positive assertions and two unresolved assertions. It does not reconstruct all fifteen comparison labels from incomplete public artifacts or treat October 2 audits as current re-verification.

For the next independently adjudicated dataset:

1. Freeze the corpus selection, source snapshots and policy wording before tuning retrieval. Include new unseen brands, random currently visible rows, five/six/seven boundaries, franchise/family-owned chains, corporate-owned boutique brands, same-name unrelated businesses, missing addresses and difficult dynamic locators. A random visible-row audit estimates residual policy violations; selected known positives measure recovery. Report those populations separately.
2. Give independent reviewers saved name/address/city and primary sources, with model outputs, registry matches and research outcomes hidden. Require exact local entity affiliation and at least six distinct currently operating same-brand branches for `chain`. A regional list of six is a valid worldwide lower bound; fewer observed branches is unresolved.
3. Require explicit complete current worldwide evidence of one to five branches before assigning a negative **location-count** reference. That reference alone does not prove mom-and-pop eligibility: corporate ownership must be separately adjudicated. Record ownership as supported corporate affiliation, supported eligibility under an explicit ownership rule, or unresolved. Family/local ownership does not override the accepted six-location rule. Unknown sources, missing data, search failure and model `false` answers never become verified negatives.
4. Group all branches, spelling variants and related entity aliases together; group known corporate siblings by parent for ownership evaluation. Resolve new identities independently, without making the registry matcher the authority for grouping. Once adjudication is frozen, sort verified group keys by SHA-256 of `chain-reliability-v1|group_key`, allocate 20% of groups to a sealed holdout and the rest to development, and freeze the resulting manifest. If stratification requires adjustment, record it before examining model/retrieval outcomes. Historical disclosed groups remain development/regression only.
5. Maintain a blinded second review for factual labels and grouping disputes. Preserve reviewer disagreement and unresolved cases; do not force a label to fill a target sample size. Report branch and entity counts, source age, positive/negative/unresolved totals and the held-out membership/hash.

## Retrieval repair and promotion criteria

Repair evidence acquisition before broadening automatic exclusions. The accepted historical run had 616 website acquisition failures, 19 ATP parsing errors and only one of 6,623 contexts marked official by the Jev 0.95 gate. Its model proposals produced no validated decisions. The [targeted retrieval experiment](2026-10-03-targeted-chain-control-results.md) recovered five controls through manually chosen official sources; automatic discovery still needs to reproduce those acquisitions without per-control URL curation.

Evaluate candidate discovery, local publisher anchoring, operating branch extraction, deduplicated counts and final decisions separately. Support alias-aware local queries and official branch pages/structured locator data while preserving exact quote provenance, same-entity affiliation, current operation, incomplete-count handling and building-address deduplication. A lower publisher threshold needs separate validation; the accepted publisher pilots found attribution errors.

Run the revised acquisition on development data, then evaluate the sealed new-brand holdout and random visible-row audit once. Report recall with abstentions counted as misses, precision/false exclusions against independently adjudicated cases, unresolved coverage, corporate-group results and uncertainty intervals. A claim that automation catches a majority requires a defensible positive-reference denominator and uncertainty bound above 50%; a 100% known-seed result does not meet that requirement. Set the stricter practical recall and tolerated false-exclusion targets before this run.

Keep proposed exclusions advisory until those criteria and independent identity/count review are satisfied. Initial safe integration can emit source-backed proposals for the existing reviewed ledger. Its two current Polly's Pies entries expire after 90 days; a refresh workflow must recheck evidence rather than simply advance dates. Any eventual production application still needs a fresh intended-database preview, preserved human locks and backup/readback verification.

Next: independently adjudicate new brands and ownership cases, freeze the holdout, and reproduce the five manual acquisition successes automatically before expanding exclusion authority.
