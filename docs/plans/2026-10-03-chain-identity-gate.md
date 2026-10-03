# Chain scorer: local identity gate

This addresses F1 from the [broad evaluation](2026-10-03-chain-broad-evaluation.md)
by adding a conservative prerequisite for source-derived counts. It does not
establish production precision or complete issue #200.

The evaluator now supplies the saved street to both models. A local anchor must
contain the saved numbered street, business name and a separate city occurrence
near that street. Common street abbreviations and apostrophes are normalized.
Missing city, missing numbered street, unmatched spelling and insufficient source
context remain `unknown`.

Address lists require an anchored official S5 publisher. Other pages on the same
non-platform publisher domain may contribute branches. A third-party explicit
total requires the local identity inside the validated count quote itself. A
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

The Python pipeline suite passes 270 tests, including four wrong-business cases,
a model identity assertion contradicted by the saved address, a mixed-business
directory page, missing local fields, street abbreviations, city-named streets,
official publisher boundaries, positive explicit totals and repaired address lists.
Independent review found the initial same-page bypass, which was fixed and
reviewed again.

Keep #201 integration gated. Next, recover and independently verify local anchors
and publisher affiliation for the affected supported rows, then run the changed
street-aware prompts on that bounded cohort. Reassess retention and rejected
identities together before expanding evaluation or considering production use.
