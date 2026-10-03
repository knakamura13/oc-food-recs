# Chain candidate audit results

The saved #200 evaluation contains 1,214 unique restaurant IDs. A public-source review of all 28 active chain candidates confirms 16, leaves 12 unknown, and repairs three active retrieval misses (Pitfire, Moulin and Corky's). The replay therefore contains 19 reviewed active chains and 1,129 active unknowns. No unknown is asserted independent.

This is manual audit assistance. Automated recall on the 66 excluded-chain controls remains 31/66 (46.97%). The automated scorer is not ready to drive production exclusions. The 19 eligible IDs are source-reviewed candidates, not authorization to write production or an estimate of automated precision.

## Evidence and limitations

The checked inputs are in `scripts/chain_candidate_audits.json`. Each audit names the exact saved ID/name/city, public URL, date and reason. Positive counts are worldwide lower bounds from official operating branches. Coming-soon locations, other brands and duplicate addresses are excluded. Reused cached evidence and failed fresh fetches are stated in the corresponding notes. Reviewer inputs are trusted assertions. Format validation does not independently verify a website's content or business affiliation.

Twelve original candidates remain unknown: both Kimmie's rows, Hong Kong Express, Board and Brew, Sunrise Cafe, El Nopal, the La Palma Taqueria de Anda row, Panda Inn, Ballast Point, Bread Basket, Gina's Pizza and Mr. Wok. Wrong-domain matches, fewer listed current locations, missing rendered data and unresolved local identity are distinct reasons. A below-six regional list does not prove a complete worldwide total.

Shared directory domains and phones currently supply inferred identity. This audit rejects specific bad matches, but does not make that automated identity mechanism reliable. Missing directory matches also prevent official-site retrieval for many known chains. Both remain blockers for automated exclusions.

## Implementation

`chain_scorer.decide` now respects explicit unsupported evidence for every signal type, including S1/S2. `chain_audit.py` validates IDs and provenance, retains rejected evidence for inspection, adds reviewed S5 lower bounds, and writes a separate result directory. Existing complete negative evidence remains available to expose conflicts. Before/after populations and hashes stay separate in the report.

The independent #201 changes set default count and city-density review thresholds to six. Unflagged and fuzzy queued classifications produce unknown confidence. Existing queues retain their status/reason while refreshing unreviewed confidence. Human-reviewed rows remain protected. The authoritative denylist still excludes its matches. There is no verified-count production integration in this change.

## Reproduce the replay

Use the chain-scorer optional dependencies and existing saved results:

```sh
python scripts/chain_audit.py \
  --results /path/to/original/results.json \
  --audits scripts/chain_candidate_audits.json \
  --output /path/to/separate/audit-results
```

No API key, model inference or database connection is needed. Results and the report are written only under the supplied output directory. Do not replace the original evaluation directory.

## Verification

- All 231 Python tests pass, including rejected S1 evidence, identity checks, preserved input bytes, unresolved decisions, conflict retention, five/six boundary behavior and ingest confidence refresh.
- The exact ingest ON CONFLICT statement was executed against disposable Postgres 18 for active, queued, human-reviewed and denylist-upgraded rows. All four expected status/reason/confidence outcomes passed. The disposable container was removed afterward.
- Independent code review found no actionable defects. Public-source labels were reviewed by the primary agent, not independently corroborated by the code reviewer.
- Replay covers all 1,214 IDs, audits 31 active rows and makes zero model calls.
- Original results SHA-256: `600bfe0edceacfab3d5de605762c95afdca5d900aa42ce550a5e8d784bd30fff`.
- Saved scratch public-table fingerprints still match. No production writes or backfill apply were performed.

Next: review and package these bounded changes, then repair automated identity matching and official-source retrieval before measuring automated precision/recall again. Production exclusion integration remains gated on that evidence.
