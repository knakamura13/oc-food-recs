# Chain scorer: locality-context rejection

The publisher-ownership experiment in draft #218 found a saved street followed by
an unrelated city-led sentence that passed the local identity gate:

```text
Example Kitchen. Visit us at 100 Main St.
Tustin is part of our dining guide.
```

The full source passed even when `Main Street.` retained a sentence/listing
separator. A synthetic six-address response then classified the saved restaurant
as `chain` despite that missing local anchor. This is separate from the remaining
publisher-ownership ambiguity.

## Change and regression evidence

The city suffix must now end the address/listing or continue into recognized
postal, contact or operating metadata. Supported continuations include ZIPs,
state/country fields, phone labels, weekday hours and open/closed schedules.
The existing explicit business/count attribution format remains supported.
That exception requires the business name immediately before its street and city
in the same listing. `Tustin has six locations featured in our dining guide`
cannot supply locality or license a branch count for the saved restaurant.
Count attribution preserves the original punctuation so a sentence-ending `St.`
cannot join a separate city-led count sentence to the named business.
An ordinary city-led narrative cannot establish locality merely by following
the saved street. Unsupported formats deliberately abstain.

Synthetic tests first reproduced twelve narrative variants and two end-to-end
six-address promotions, including the city-as-count-subject case identified by
independent review. The fix rejects them while preserving abbreviated business
names, suite formats, adjacent-branch rejection and existing count attribution.
Additional tests preserve postal/country fields and operating suffixes encountered
in the cached source frame. Two direct-business-prefix variants also reject a
separate city-led count sentence. All **288 pipeline tests** pass.

### Follow-up: preserve the count-path boundary

The initial source-anchor fix still left a separate third-party count path that
removed the period after `St.` before passing a quoted span to `source_identity`.
`Example Kitchen at 100 Main St. Tustin has six locations.` consequently verified
an unrelated city-led count and allowed an erroneous Gemma response to promote
the restaurant. New tests reproduced both S4/S5 identity failures and that
end-to-end promotion before the repair.

Count quotes now retain sentence-ending street periods. Only unambiguous
abbreviations before a comma, or a directional abbreviation internal to the
saved street, are protected before splitting. Directly attributed counts with
`100 Main St., Tustin` and `100 N. Main St, Tustin` remain supported. The invalid
city-led count stays unknown even when the model asserts verified identity.
The follow-up passes **291 pipeline tests**, including 94 scorer tests. This
repair changes neither the official publisher threshold nor branch counting.

A private replay of the frozen publisher answers also requires the quoted local
identity to agree with its **full original source**, using that source as the
anchor supplied to `source_identity`. A clipped quote alone can end at the city
and omit the following narrative; callers must retain the original context.
The production evidence scorer already supplies the original publisher contexts.
The old publisher pilot is a historical experiment, not a production gate, and
its unchanged frozen artifacts are not overwritten by this replay.

| Replay measure | Result |
| --- | ---: |
| Cached candidate anchors before / after | 249 / 249 |
| Frozen publisher answers replayed | 80 |
| Accepted decisions changed | 2, the same missing-city negative in both lanes |
| Supported holdout publishers retained | 3/3 in both lanes |
| Known third-party holdouts accepted | 0/4 in both lanes |
| Unresolved holdouts accepted, complete-quotes / operator-quote | 15/17 / 1/17 |
| New model calls | 0 |

The full-source, clipped-quote-with-original-context and unabbreviated-street
variants all reject the invalid locality. The complete-quotes lane's total
acceptance drops from 30 to 29; the operator-quote lane drops from 11 to 10.
Other recorded publisher decisions remain unchanged. Source acquisition,
reference-review and sample-selection limitations from #218 still apply. This
replay does not establish publisher precision or rerun the complete chain cascade.

Private artifacts are in `output/chain-scorer/issue-200/locality-context-20261003/`:
`replay.py`, both result lanes, `candidate-anchor-changes.json`, `summary.json`
and reproduction dependency hashes. The replay depends on the frozen
`publisher-ownership-20261003/` and `publisher-expanded-20261003/` inputs and the
baseline evaluator from merged #217 (`0cc665648dd238d98b84c06e7d7cf5b04775a707`).
The replayed request-input SHA-256 is
`4fe96406f4d18d181415ebc9c9867e337a12d29940e05b647b0d1979364cf9f8`.

Keep #200 open and #201's exclusion integration gated. The next step is to reject
weak publisher proof or preserve abstention, replay the known controls, and
complete the full scratch evaluation and remaining worldwide-count audits.
No database access, local inference or production exclusions occurred here.
