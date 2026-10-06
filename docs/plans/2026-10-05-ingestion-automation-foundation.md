# Ingestion Automation Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver ingestion preservation guards and a durable local work queue, while establishing an honest chain-policy benchmark before broader exclusions.

**Architecture:** Reuse the current extraction and transactional publication path. Fail closed on malformed model output, limited publication and incomplete comment trees; normalize Reddit identities and preserve source takedowns/unpublished threads. A separate local queue stores post-ID work state with atomic updates and resumable attempts; it performs no network acquisition or database writes. Chain benchmarking evaluates the actual production registry separately from the scientific scorer and retains unresolved references.

**Tech Stack:** Python unittest, JSON state files in ignored output, existing PostgreSQL/SQLite SQL regression patterns, GitHub CI.

Approved design: Kyle's October5 automation/fact-checking proposal, approved by "Proceed with next steps". Continue through focused PRs, reviews and merges under existing authorization. Live Reddit acquisition waits for approved API/OAuth access; large inference/geocoding waits for measured calibration and workload approval.

## Task 1: Publication preservation

Owner: ingestion guard worker. Files scripts/reddit_pipeline.py and tests/test_reddit_pipeline.py (additional synthetic regression module allowed).

1. Reproduce malformed model JSON becoming an empty successful extraction; implement explicit error for invalid/schema-invalid results while allowing valid empty arrays. Verify red then green.
2. Reproduce limited ingest writing a replacement; reject non-dry-run limited work before extraction/geocoding/publication. Preserve limited diagnostic runs; batch must not archive dry runs.
3. Reproduce bare JSON comment IDs and ignored more nodes. Normalize to existing t1 fullnames, validate mismatched identity, reject unresolved comment placeholders rather than silently claiming completeness.
4. Reproduce unpublished thread becoming public on conflict; preserve existing publication preference. Cover actual SQL behavior with isolated SQLite/native SQL regression where feasible. Preserve tombstones and reviewed restaurant semantics.
5. Verify focused tests and full existing pipeline suite, no model requests/database credentials. Root reviews diff before commit.

## Task 2: Resumable local queue

Owner: root. Files scripts/ingest_queue.py, tests/test_ingest_queue.py, docs/INGEST_TRACKING.md, CONTRIBUTING.md, package.json.

1. Write failing tests for URL/fullname/plain-ID canonicalization, duplicate-safe import, skipped/rejected reconciliation and stable identity across subreddit case.
2. Implement local JSON queue import from audit snapshot and URL lists. Keep capture metadata distinct from actual ingestion; a captured file never proves published state.
3. Write failing tests for attempt/state transitions, crash recovery, failure retry, terminal-state protection and atomic concurrent-update behavior. Implement small explicit queued/running/failed/complete/skipped/rejected lifecycle with lock and per-record attempts/results; expired/dead local claims recover explicitly.
4. CLI import/status/claim/finish/fail/recover; no downloader/DB/model calls, secrets or source text in queue. Save state under ignored output. Ensure no automatic publication from queue states.
5. Verify using synthetic data, import the213-item private audit and seven newly discovered URL candidates without printing source content. Correct unsupported ingest --thread documentation, describe remaining API/access and safe-preview limits.

## Task 3: Chain benchmark groundwork

Owner: separate read-only benchmark agent initially. Files docs/plans/2026-10-05-chain-reliability-benchmark.md and private output/automation-audit/chain-benchmark/.

1. Freeze historical control IDs and references with recorded source baseline, entity/brand grouping, unresolved labels and corporate-group category. Do not turn excluded flags into universal factual truth.
2. Run the current production seed-registry matcher offline and contrast with the separately documented research scorer. No DB/model/network-paid calls. Report denominator/coverage limits and concrete alias/matching misses.
3. Specify independent positive/negative adjudication and held-out-by-brand split before retrieval changes. Keep local hard negatives synthetic unless independently source-verified; do not manufacture independence labels.
4. Publish concise source-grounded benchmark procedure/results, not raw Reddit/private artifacts. A later independent audit and retrieval repair remain required before automatic exclusions are broadened.

## Delivery

Review spec then code quality independently, run full pipeline/unit/type checks and diff checks. Commit only focused source/tests/docs, push, open and attach PR. Address automatic review and merge after green final-head CI. Update #18/#174 with delivered capabilities and remaining access/coverage boundaries. Continue authorized unblocked follow-ups; no production ingestion/exclusion writes or recurring schedule until complete acquisition and measured evaluation are ready.
