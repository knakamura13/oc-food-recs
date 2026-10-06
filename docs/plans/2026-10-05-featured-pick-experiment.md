# Featured Pick Experiment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete #180 with a source-reviewed featured-pick mock, a fair baseline/placement comparison, and an explicit continue/defer decision.

**Architecture:** Keep production code and data unchanged. A local GET-only loopback proxy displays the current public explorer and injects either no pick, an inline card, or a compact evidence-dialog prompt after hydration. A separate local control page switches variants and manually alternates two reviewed picks. Preserve the existing community ranking and stable public restaurant URLs.

**Tech Stack:** Read-only PostgreSQL capture, Node.js loopback preview, native HTML dialog and controls, Playwright browser comparison, text-only research report, GitHub PR delivery.

---

## Design and authorization

Kyle approved proceeding with #180 after the proposed small manually selected recommendation with dated source evidence and a link to full details. This remains a bounded experiment, not production scheduling/personalization approval. The existing brainstorming/avoid-ai-slop workflow is used; no routine design confirmation is required under the accepted scope.

Considered approaches:

1. **Compact prompt opening a source card:** preserves browsing space while offering a deliberate entry point. Recommended comparison candidate, subject to measurements and visitor usefulness evidence.
2. **Full inline card above the explorer:** makes the evidence visible immediately, but may shrink the locked desktop map/list and delay phone search access. Test rather than assume.
3. **Scheduled or personalized picks:** adds operational and ranking commitments before demand is proven; outside this experiment.

Use OC Foods' existing type/color direction. Each card shows an exact original comment, its source date/link, the editorial selection reason, and full restaurant details. Display the historical-evidence limitation. Keep chain confidence unknown; do not claim verified ownership, current menu, deals or opening status. Label the two picks as manual experiment choices, not a popularity ranking. Source counts describe published associations and must not imply every comment is a distinct favorable recommendation.

## Task 1: Review selection and baseline

- Capture candidates with >=2 published threads, >=3 distinct comments and >=2 explicitly named standalone sources, using current public gates in a read-only transaction.
- Independently review a primary pick and one manual alternate. Verify exact excerpts, source dates, live API inclusion, and stable detail links.
- Read the actual explorer layout and existing detail/share flow; record source facts separately from UX hypotheses.

## Task 2: Build the local comparison

- Private files: `output/issue-180/source-review.json`, `preview-server.cjs`, `feature.js`, `feature.css`.
- Local artifact: task visualization directory `featured-pick.html`, with native variant/pick controls and a loopback preview frame.
- Proxy only anonymous GET/HEAD requests for public explorer/assets/detail data; reject writes and admin routes. Keep real source exports local.
- Insert the local presentation after the explorer hydrates. Compact prompt opens a native dialog; Escape/close returns focus. Full details uses the stable production route; copying a link always identifies the restaurant, independent of the selected rotation.

## Task 3: Verify and decide

- Compare baseline, inline and compact variants at 1280×720, 1440×900, 390×844 and 320×568; inspect screenshots and measure map/list height, controls position and overflow.
- Exercise source/detail links, exact quote/date/reason, keyboard dialog/focus, manual alternate and clipboard/fallback. Include enlarged-text/narrow-width checks.
- Ask for optional owner usefulness feedback after presenting the concrete mock; do not interpret silence as approval or proof.
- Publish a text-only report with measured layout effects, source identifiers, limitations, and a gate-based decision. Distinguish behavior checks from visitor usability; keep exports/quotes/screenshots private.

## Task 4: Deliver

- Review metric/source consistency and privacy; run required checks.
- Commit/push a focused documentation PR ending with the AI-agent disclaimer. Address findings, resolve addressed threads and merge after green CI under the existing authorization.
- Read back the merged report and issue completion decision; reconcile #174 and keep #155 parked. No new production feature is assumed from the experiment.
