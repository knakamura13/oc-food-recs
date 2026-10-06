# Dish Discovery Experiment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete #178 with a verified local comparison prototype, bounded evidence report, and explicit continue/defer decision.

**Architecture:** Capture production comment-search output and eligible source associations in a read-only transaction. Review a frozen top-ten sample per dish, generate a local comparison from those labels, and publish only the text report and methodology. No production route or schema changes.

**Tech Stack:** PostgreSQL read-only queries, Node.js/Python for local evidence processing, self-contained HTML, Playwright for browser verification, GitHub CLI for delivery.

---

### Task 1: Freeze and review the evidence

**Files:** local ignored `output/issue-178/evidence.json`, `live-baseline.json`, `review.json`.

1. Capture the three queries: `pho`, `breakfast burrito`, `fish tacos`, preserving #166 publication predicates.
2. Confirm distinct best-mention order matches every slug in the deployed API result.
3. Freeze the first ten restaurants per query; review full supporting comments and ambiguous parent context.
4. Save labels, source identifiers and reasons; count unique comments separately from attached restaurant mentions.

### Task 2: Build the comparison

**Files:** local ignored `output/issue-178/build-prototype.py`; local visualization `dish-discovery.html` and `dish-discovery-data.json`.

1. Use captured baseline quotes in the current-search view and exact supporting excerpts in the reviewed view.
2. Keep original relative order, dates, source links and restaurant identities. Label parent-context reliance and historical evidence.
3. Use a native dish selector and native radio controls. Use text-safe DOM construction and local styling.
4. Validate the 30 frozen rows and expected supported counts (3/6/4); compare the supported candidates with the existing metadata-search function.

### Task 3: Verify and report

**Files:** local `output/issue-178/verify-prototype.cjs`, local screenshots and verification JSON; public `docs/research/2026-10-05-dish-discovery.md`.

1. Open the artifact in Playwright at 320, 390 and 1280 pixels; assert query/view counts, sources, keyboard changes, no horizontal overflow and no console errors.
2. Inspect desktop and phone screenshots. Record actual results without inventing a user study.
3. Write the report with source identifiers and paraphrases only; state limitations and an explicit decision.
4. Review the public diff for source-text exports, misleading metrics and scope creep; run `git diff --check`.

### Task 4: Deliver and reconcile

1. Commit the report and these experiment documents with the repository commit convention.
2. Push `knakamura/178-dish-experiment`, open and attach a PR ending with the AI-agent disclaimer.
3. Inspect review threads and CI; address actionable findings, resolve addressed threads, and merge only after required checks pass.
4. Read back the merged report and issue state. Close #178 as an experiment with the recorded decision, not as a shipped dish feature.

Execution continues in this session under the user's existing authorization. The design records the agreed experiment; it does not reopen the prior workday plan or the parked #155 work.
