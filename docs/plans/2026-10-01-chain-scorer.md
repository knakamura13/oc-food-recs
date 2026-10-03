# Read-only chain scorer design and implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete issue #200's cascade and evaluation on the specified scratch restore without changing restaurant publication state.

**Architecture:** Separate deterministic decisions from source acquisition and evaluation. Explicit loopback scratch DSN, database identity validation, and read-only transactions prevent production access or writes. Source snapshots and model responses are cached under ignored output paths, with provenance, errors, and resumable request hashes. Public reports contain aggregate findings and restaurant names, never exported Reddit text or handles.

**Tech Stack:** Python, psycopg, DuckDB/httpfs, requests, ijson, tldextract, Jev System One, local Ollama gemma4:31b.

## Design choices

The issue and #199 supply the approved policy: six or more locations worldwide means chain; five or fewer confirmed locations means independent; missing evidence means unknown. A brand-list prefix alone cannot decide. Overture and ATP counts are observed lower bounds, not proof of exhaustive coverage. Site-builder/ordering domains never identify a chain. Same-name counts require a domain/phone or a model generic-name check; weak model-only evidence stays distinguishable from deterministic signals.

A monolithic one-off probe would be faster to start but difficult to replay or test. Production classifier integration would conflate this evaluation with #201. Use a standalone scorer with cached acquisition and an explicit evaluation report, keeping policy rollout in #201.

## Requirements and proof

- Restore `prod-pre-154-20261001T035812Z.dump` to local Postgres 18; record SHA256 and table fingerprint before/after.
- Score every active row, with extra excluded-chain rows for recall.
- S3: NSI food lists and ATP; token-prefix normalization and generic-token guard; second signal required.
- S1: global Overture location counts by eligible website domain; local coordinate/name or conservative city/name entity match.
- S2: normalized names restricted by shared domain/phone, or evidence of a non-generic name.
- S4/S5: per-mention Reddit and fetched website evidence through Jev, retaining probabilities and abstention.
- S6: local Gemma on unresolved evidence bundles; preserve evidence and abstentions.
- One result per restaurant with decisions, signals, counts, and limitations.
- Aggregate counts, 66-chain recall and all misses; F6 disagreements; 5/6/7 boundary checks.
- Relabel all 62 comparison items under worldwide 6+ policy; run Jev and Gemma with the same threshold question; report coverage and metrics without promoting missing labels to negatives.

## Execution

1. Write synthetic failing tests for token matching, domain isolation, six-location boundary, unknown/independent distinction, read-only DSN guard, and metrics.
2. Implement deterministic scorer and pass the tests.
3. Write failing acquisition/adapter tests, implement cached source and model adapters, verify failures cannot manufacture negative evidence.
4. Run global source acquisition, website fetches, per-mention Jev decisions, and unresolved Gemma cascade on the scratch export.
5. Run the 62-item comparison and boundary spot checks; produce row results, manifests, disagreement lists, and aggregate report.
6. Verify database unchanged, all required rows processed, meaningful tests and pipeline regression suite passing; review exact diff.
7. Commit, push, create and attach the PR with acceptance evidence; update issue #200 and close only when its requirements are proven.
