# Chain candidate audit implementation plan

**Goal:** Reconcile the completed scratch evaluation with checked public sources, using no model calls or database writes.

**Architecture:** Keep the original evaluation immutable. A separate audit replay validates restaurant identities and public-source provenance, marks rejected count evidence unsupported, and adds reviewed worldwide lower bounds. Candidate decisions and automatic-exclusion eligibility remain separate. Unresolved audits do not establish independence.

**Tech stack:** Python, existing scorer decision function and public-source audit validator, unittest.

1. Reproduce the bug: an S1 item with supported=false still yields chain. Add a regression test and make all signal kinds respect explicit rejection.
2. Add a cache-only audit replay command. Reject duplicate/unknown/mismatched audit identities and invalid policy labels. Write a new result directory and report before/after counts, changes, and eligible reviewed IDs.
3. Audit all 28 active chain candidates. Carry public URLs, dates, snapshot hashes when available, and short reasons. Reuse checked probe evidence for retrieval misses.
4. Replay all 1,214 saved rows without inference. Verify unique IDs, preserved original hashes, unchanged scratch fingerprints, and meaningful Python regressions.
5. Document raw scorer performance separately from audit-assisted results. Keep automatic production exclusion wiring gated on verified precision.
