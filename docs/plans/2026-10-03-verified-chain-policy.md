# Verified chain policy implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete #201 by sharing a bounded, audited worldwide-location policy across ingest and both backfill entry points.

**Architecture:** Keep the existing authoritative denylist. Add a small reviewed evidence ledger keyed by exact normalized name, city and full street address. Seed only the two newly verified Polly's Pies identities from #200; do not generalize the nine audited ATP/Overture decisions into an unvalidated matcher. Unproven LLM, Google-count and density hints stop creating review queues. Visitor and dedupe queues and human locks remain protected.

**Tech Stack:** Python, unittest, JSON evidence ledger, existing PostgreSQL transaction guards.

The merged #200 report and the instruction to proceed authorize this design. A broader live ATP/Overture matcher would need its own precision evaluation; a brand-only denylist addition would lose the verified local identity binding. The reviewed ledger is the smallest supported integration. Evidence expires after 90 days and fails to unknown when stale, malformed, incomplete or identity-mismatched. A lower bound below six never establishes independence; only a reviewed complete worldwide count of one to five can.

## Task 1: Test and implement the evidence gate

Create `scripts/chain_policy.py`, `scripts/chain_policy_evidence.json`, and tests in `tests/test_exclusions.py`. First reproduce missing verified exclusion and old automated queues. Cover the five/six boundary, lower-bound versus complete counts, stale/future dates, exact identity mismatch, missing street, malformed counts, and model-supplied flags. Run the tests red before implementation, then green. The public ledger contains only published restaurant facts and source URLs, never private model artifacts.

## Task 2: Share classification and preserve manual work

Modify `scripts/reddit_pipeline.py`, `scripts/apply_exclusions.py`, and `scripts/backfill_chain_policy.py`. Use the ledger from the shared classifier/confidence helpers. Backfill must select street so identity checks can run. Clear only legacy automated queue reasons; preserve visitor/dedupe queues. Guard ingest conflict updates so incoming audited evidence cannot exclude a saved row with a different identity. Keep `reviewed_at IS NULL` guards. Retire the unused paid Google count call. Update changed behavioral assertions and add real integration regressions in `tests/test_reddit_pipeline.py`.

## Task 3: Verify the fixed scratch corpus and deliver

Use the existing SELECT-only loopback scratch reader, never the production environment. Run the actual apply-exclusions dry-run entry point against the restored database and compare before/after fingerprints. Reconcile the two new exclusions with #200 IDs 1166 and 1199, disclose registry and legacy-queue transitions separately, and verify every protected row. Run the full pipeline suite, independently review the exact diff, document findings and expected counts, then commit, push and open a PR. No production apply is part of this delivery.


## Completed verification

The baseline is merged main `3dfa3a03ef6775eaf5b94fda7fee21256ed04873` (#218 and #219). #200 is closed with its final scientific evaluation; its weak model recovery does not authorize broad automatic ATP/Overture exclusions.

The new public ledger contains only the two primary-source-audited active identities: Polly's Pies at 136 N Raymond Ave, Fullerton, and Polly's Pies Restaurant at 2660 N Main St, Santa Ana. Each cites its official local page and the official twelve-address locations page. The count is a worldwide lower bound, not proof of completeness. `checked_at` uses UTC; fresh entries remain usable for 90 days. Re-review the identity and current count before changing that date. No verified-independent entries are seeded.

The actual exclusion and both backfill dry-run entry points were run against the unchanged #200 scratch restore with the loopback SELECT-only reader and read-only transactions. Default seed preview and `--skip-seed` produce the same changes:

| Result | Count |
| --- | ---: |
| All scratch restaurants | 1,224 |
| Active / excluded before | 1,148 / 76 |
| Non-human-locked / human-locked | 1,199 / 25 |
| New audited exclusions | 2 |
| Active rows refreshed from legacy independent to unknown | 1,131 |
| Legacy automated queues in this dump | 0 |
| Existing excluded rows changing | 0 |

The two new exclusions are #200 IDs 1166 and 1199. All other active identities receive no new chain decision, matching #200's 1,146 unknown active decisions. Fifteen active human-locked rows retain their legacy `independent` confidence instead of being refreshed; their locks come from merge/rename work, not confirmed worldwide independence (F4 in #199). Ten excluded human-locked rows are also untouched. Existing denylist exclusions remain authoritative. The 66 known-chain evaluation controls and ten closed restaurants retain their status; the seven scorer-recovered controls are not seven new exclusions. The proposed resulting statuses are 1,146 active and 78 excluded. No claim is made that the dump exercises visitor queues: unit and SQL regressions cover those paths separately.

All seven public-table fingerprints remain identical. The verification executes seventeen native PostgreSQL SELECT scenarios using the actual ingest CASE expressions, including human locks, wrong city/street/name, legacy queue retirement, protected visitor/dedupe queues, expiry/removal, verified independence, and preservation of an audited name. SQLite unit regressions also execute those CASE expressions in CI. Independent review found three identity/expiry issues; each was reproduced by a failing test, fixed and re-reviewed without remaining findings.

Validation: 301 pipeline tests, 312 Vitest tests across 41 files, and `npm run check` with zero errors/warnings. The pipeline suite requires the project Python environment; the system Python lacks scorer dependencies. No local or hosted model requests are needed for this integration.

Private reproduction artifacts remain in `output/chain-scorer/issue-201/`: `verify_scratch.py`, all three entry-point logs, row-level `changes.json`, `fingerprints.json`, and `verification.json` with code hashes. Do not load the production environment to reproduce this run. Production application requires a fresh preview and backup against the intended live database; this PR only delivers and verifies the code and proposed transitions.


### PR review follow-up

The automated review found that the raw SQL comparisons rejected punctuation/spacing variants accepted by the ledger, and that a file-path import could not find the sibling policy module in isolation. Both were reproduced before fixing. The evidence matcher and all three SQL guards now share ASCII token normalization, preserving boundaries while accepting smart apostrophes, repeated whitespace and street punctuation. Ten input strings also match between Python and native PostgreSQL normalization. The loader resolves the sibling from the pipeline file and reuses its canonical module cache; an isolated subprocess regression imports from an unrelated directory with `-I`. The principal pipeline test module passes independently (49 tests), and the full suite passes 301 tests. Independent focused review approved the repair. The scratch proposal and all seven table fingerprints remain unchanged.

## Production application and remaining confidence provenance

PR #220 merged as `9d182608af29a2de8f08838f7c32fb2b793edd32`. Both CI jobs passed on its repaired head `db9dfb2cccf11e5babcda1010b7c7ffea8c55b46`, and Railway production deployment `6bffba5f-88ce-4cfa-8fca-f4ff773b60d7` reached `SUCCESS` with the merged commit. #201 closed on merge.

The production preview reproduced the scratch proposal exactly. A complete PostgreSQL custom-format backup was taken and its table-of-contents checked before writing. It includes all seven public tables and the Drizzle migration ledger. The private backup is `data/backups/prod-pre-201-20261004T065519Z.dump` (321,966 bytes; SHA-256 `9d99de093a3114d5df4654179aa6c5b8022f4879216e4dec76879a406a667b9f`).

At `2026-10-04T06:56:36Z`, one transaction applied the 1,133 previewed changes with exact row-state preconditions. Committed readback verified the two new exclusions and 1,131 active confidence changes to `unknown`. All 25 human-locked rows, unplanned rows and fields, and the other six public tables remained unchanged. No model requests, registry changes or schema changes ran.

| Committed production result | Count |
| --- | ---: |
| Active restaurants | 1,146 |
| Excluded restaurants | 78 |
| Active `unknown` | 1,131 |
| Active legacy `independent` protected by merge/rename locks | 15 |
| Confirmed independent decisions established by this work | 0 |

Railway's existing HTML cache briefly served the pre-backfill homepage. Purging only production HTML at `2026-10-04T06:58:59Z` resolved it. Fresh requests verified HTTP 200 from the homepage with neither excluded slug in its payload; `/api/health` reported 1,146 restaurants, 73 threads and 2,379 mentions. Both `/api/r/polly-s-pies.json` and `/api/r/polly-s-pies-restaurant.json` returned HTTP 200 with `[]`, as required by the public mention API's exclusion filter. The app has no `/restaurants/[slug]` detail route; a 404 there is not evidence of exclusion.

Private live artifacts are under `output/chain-scorer/issue-201/live-20261003/`: the actual preview, backup TOC, before/after fingerprints, exact changes, committed readback record and `http-after-purge.json`. These describe a completed application, not instructions to rerun the write.

The 15 protected legacy confidence labels remain a D2 provenance gap. `reviewed_at` also protects identity edits, so it cannot establish a complete worldwide count. Likewise, the admin restore action currently assigns `independent` without collecting count evidence. The public report acknowledgment now says "Kept on the site" instead of asserting independence. A follow-up must distinguish an identity/visibility override from a verified count, correct these legacy labels with a separately guarded preview, and preserve names, aliases, statuses, review timestamps and genuine evidence-backed decisions. #199 remains open until that gap is resolved; broader automatic ATP/Overture matching remains outside the accepted evidence gate.
