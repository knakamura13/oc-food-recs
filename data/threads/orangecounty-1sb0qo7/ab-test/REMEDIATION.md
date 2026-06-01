# Remediation & re-evaluation — patching the gemma4 extraction issues

Follow-up to `REPORT.md`. We implemented fixes (a) the latent thinking-model bug, (b) prompt + post-processing improvements, and (c) re-scored everything against the same Claude oracle to decide whether a model swap to `gemma4:26b` is worth it.

## Three root causes (the audit found, this confirmed)

| # | Cause | Symptom | Fix |
|---|---|---|---|
| 1 | **Thinking-model truncation** | `gemma4:26b`'s chain-of-thought consumes `num_predict:512` → `content` empty → silent `[]`. A naive swap would have *worsened* recall. | Send `"think": false` (default). |
| 2 | **Schema-wrapper loss** (parser bug) | Model emitted `{"establishments":[{"name":"Captain Mauri's"}]}`; parser only understood bare arrays → discarded a valid extraction. | Unwrap known envelope keys in `normalize_extractor_result`. |
| 3 | **Model under-extraction** | Genuine `[]` on terse non-foody names ("Pops in Santa Ana"); cuisine left null where obvious; description used as name ("Italian fusion restaurant"). | Prompt rules + few-shot; deterministic cuisine backfill + generic-phrase rejection. |

## What changed (`scripts/reddit_pipeline.py`)

- **`think` flag** — new `OLLAMA_THINK` (default `False`, env `OC_FOOD_RECS_OLLAMA_THINK=true|false|omit`), injected into the Ollama payload. Verified a no-op on `gemma4:latest`, required for `gemma4:26b`. Future-proofs any model swap.
- **`SYSTEM_PROMPT`** — added: a proper-name/"Name in City" *must-extract* rule; name-vs-description guidance; explicit cuisine-inference examples; a generic-phrase negative rule; more OC abbreviations (incl. SNA/MV/LF); a closed/defunct → `[]` rule; "return a top-level array, never an object wrapper"; and 3 few-shot examples.
- **`normalize_extractor_result`** — unwraps `{"establishments"|"restaurants"|…: [...]}` envelopes; rejects a small blocklist of generic phrases ("a wine tasting place"); backfills `cuisine` from an unambiguous food word in the name (`cuisine_from_name`, keyword map). Sentinel-dropping and the existing test invariant preserved.
- **Harness** — `scripts/ab_extract.py` gained `--model` / `--think`; `scripts/ab_score.py` scores any variant against the oracle. Unit tests: **15/15 pass**.

## Re-evaluation (same 129 comments, same Claude oracle)

| variant | entities | `[]` | missed recs | exact-name | precision | recall | F1 | cuisine% |
|---|---|---|---|---|---|---|---|---|
| oracle (Claude) | 177 | 6 | 0 | 129 | — | — | — | 64% |
| `gemma4:latest` original | 161 | 19 | 14 | 106 | 0.95 | 0.86 | 0.90 | 43% |
| post-processing only¹ | 161 | 18 | 13 | 108 | 0.96 | 0.86 | 0.91 | 60% |
| **`gemma4:latest` patched** | 176 | 8 | **3** | 120 | **0.97** | **0.94** | **0.95** | **62%** |
| `gemma4:26b` (think:false)² | 180 | 7 | 3 | 119 | 0.96 | 0.96 | 0.96 | 56% |

¹ original model output re-parsed through the new parser only (no prompt/model change) — isolates the deterministic fixes.
² think:false + **old** prompt — isolates the model-swap effect.

**Ablation:**
- **Post-processing alone** (zero model/prompt change, zero latency): cuisine **43%→60%**, recovered the wrapper-loss, removed the "wine tasting place" fabrication. Cannot fix genuine `[]` drops (recall stays 0.86).
- **Full patch on `gemma4:latest`**: recall **0.86→0.94** (missed-recs 14→3), precision **0.95→0.97** (fabrications gone), F1 **0.90→0.95**, cuisine **43%→62%**.
- **`gemma4:26b`**: recall 0.96 (the ceiling) but **slower**, lower precision (0.96) and cuisine (56%) than patched-latest.

**Targeted scorecard** (the original 10 dropped recs + 2 fabrications): patched-latest fixes **9/10 drops** (only "Double bamboo" remains — genuinely ambiguous; 26b misses it too) and **both** fabrications ("Ake Larry" now correct; "wine tasting place" gone).

## Recommendation

**Ship the patch on `gemma4:latest`; do *not* swap to 26b.** Patched-latest matches 26b on F1 (0.95 vs 0.96) and beats it on precision and cuisine coverage, at the fast model's latency. The `think:false` default also means a future swap to 26b (`OC_FOOD_RECS_OLLAMA_MODEL=gemma4:26b`) will Just Work instead of silently breaking — keep 26b as the optional accuracy ceiling, not the default.

**Remaining gaps (minor):** 3 missed-rec comments (incl. the ambiguous "Double bamboo"); cuisine still trails the oracle by ~2pp on world-knowledge names (e.g. "Taste of Burma"→Burmese) that neither the keyword map nor a small model reliably infers. The closed/defunct→`[]` policy is now explicit — confirm that matches product intent.

## Reproduce

```bash
# patched fast model (the recommended config):
python3 scripts/ab_extract.py run-gemma --model gemma4:latest --think false --out gemma4-patched.jsonl
# optional accuracy ceiling:
python3 scripts/ab_extract.py run-gemma --model gemma4:26b    --think false --out gemma4-26b.jsonl
# score any variant(s) against the Claude oracle:
python3 scripts/ab_score.py gemma4.jsonl gemma4-patched.jsonl gemma4-26b.jsonl
python3 -m pytest tests/test_reddit_pipeline.py -q
```
Production reads `OC_FOOD_RECS_OLLAMA_THINK` (default `false`) and `OC_FOOD_RECS_OLLAMA_MODEL` (default `gemma4:latest`) — no code change needed to switch models.
