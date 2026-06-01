# A/B Sanity Check — gemma4 vs. Claude on the extraction stage

**Thread:** `orangecounty-1sb0qo7` — *"What's your favorite 'mom and pop' family-owned restaurant?"*
**Stage under test:** `default_extract_entities()` — the only LLM call in the pipeline. It receives one top-level comment body and must return a JSON array of `{name, location, cuisine}`.
**Systems:** **B (under test)** = `gemma4:latest` via Ollama, the real pipeline call, temp 0, `num_predict` 512, exact `SYSTEM_PROMPT`. **A (oracle)** = Claude, extracting **blind** (never saw gemma's output) under the identical contract. **C** = legacy live data, informational only.
**Inputs:** all **129 top-level comments** (the model never sees the thread title — neither system did).
**Rigor:** blind oracle pass + independent adversarial recheck that steelmanned gemma and audited the oracle. gemma4 confirmed **deterministic** at temp 0 (re-run byte-identical).

---

## Headline verdict

**gemma4 is well-grounded but lossy.** When it chooses to extract, it almost never invents facts — establishment **precision ≈ 0.99** (only **2** fabrications in 161 outputs). Its failures are by **omission and under-inference**, not hallucination:

1. **It silently dropped 11 of 129 recommendations entirely** — returned `[]` for comments that clearly named a restaurant. Those recs would simply never enter the dataset. (**Recall ≈ 0.90**, but the loss is concentrated in whole-comment drops, which is worse than the number suggests — there is no partial signal to recover.)
2. **It populates `cuisine` far less than it should** — only **43%** of entities vs the oracle's 64%; in **21** cases the cuisine word was *literally in the name* (e.g. "Peter's **Burgers**" → left null).
3. **2 genuine grounding errors:** it turned the description *"Italian fusion restaurant"* into a name (missing the real name "Ake Larry"), and turned the generic phrase *"a wine tasting place"* into an establishment.
4. **Judgment is inconsistent**, not systematically wrong — it drops some bare names ("Keno's", "Kimmies") yet keeps others ("Il Barone", "Volcano Burger"); it infers cuisine sometimes and not others.

It is **not** making things up. It **is** making mistakes — mostly the quiet, hard-to-notice kind (missing data), which for a recommendations dataset is arguably the most damaging failure mode.

---

## By the numbers

| Metric | gemma4 (B) | Claude oracle (A) |
|---|---|---|
| Entities extracted | 161 | 177 |
| Comments returned `[]` | **19** | 6 |
| `cuisine` populated | 70 / 161 (**43%**) | 115 / 177 (64%) |
| `location` populated | 131 / 161 (81%) | 133 / 177 (75%) |
| Fabricated establishments | **2** | 2 (oracle over-reach, see below) |
| Confirmed missed establishments | **~16** (incl. 11 whole-comment drops) | — |

**Establishment-level (oracle ≈ truth, post-adjudication):** precision **≈ 0.99**, recall **≈ 0.90**, F1 **≈ 0.94**.
*(Note: gemma's `location` coverage is actually slightly higher than the oracle's — it is not weak on location recall; the oracle was deliberately stricter, e.g. refusing to expand "SNA".)*

### Adjudicated outcome of all 129 comments

| Category | Count | Meaning |
|---|---:|---|
| **MATCH** | 59 | Identical names + fields |
| **CUISINE_DIFF** (names agree) | 37 | gemma usually null where oracle inferred |
| **GEMMA_DROPPED_REC** | **11** | gemma returned `[]`; a real rec was lost |
| AMBIGUOUS | 7 | Prompt under-specifies (closed places, dish-vs-name) |
| GEMMA_EQUAL_OR_BETTER | 6 | gemma's call ≥ oracle |
| NAME_STYLE_DIFF | 3 | Same entity, casing/typo/qualifier |
| LOC_STYLE_DIFF | 2 | Same entity, location normalization |
| **GEMMA_FABRICATION** | **2** | Invented/misnamed |
| GEMMA_PARTIAL_MISS + LOC_ERR | 1 | Dropped list items + a location error |
| ORACLE_OVERREACH | 1 | Claude wrong, gemma right |
| **Total** | **129** | |

---

## Finding 1 — CRITICAL: 11 recommendations silently dropped

gemma returned `[]` for these comments, each of which clearly names an establishment. Claude (and usually legacy) extracted them. This is the most consequential failure: **the recommendation vanishes with no trace.**

| Comment | Body (verbatim) | gemma | oracle |
|---|---|---|---|
| `oe42lnv` | "The Green Chile in La Habra" | `[]` | The Green Chile / La Habra |
| `oe0do32` | "Pops in Santa Ana" | `[]` | Pops / Santa Ana |
| `oe40jn0` | "Yoo's place Irvine" | `[]` | Yoo's Place / Irvine |
| `oe01we4` | "Anepalco (either location) in Orange" | `[]` | Anepalco / Orange |
| `oe01gp7` | "B and C in Placentia. Something for everyone and I love it." | `[]` | B and C / Placentia |
| `oe0i7z7` | "Choice burgers in Brea just changed ownership but still staying the same" | `[]` | Choice Burgers / Brea |
| `odzxsme` | "Keno's" | `[]` | Keno's |
| `oe037zn` | "Jin cook" | `[]` | Jin Cook |
| `oee7dci` | "Kimmies" | `[]` | Kimmies |
| `oe0d848` | "Captain Mauri's" | `[]` | Captain Mauri's |
| `oe03zld` | "Trieu Chau or mi la cay" | `[]` | Trieu Chau (+ "mi la cay", ambiguous) |

**Pattern:** the drops cluster on (a) bare single names and (b) names that don't *sound* like food ("Keno's", "Pops", "B and C", "The Green Chile", "Yoo's place", "Anepalco"). gemma appears to apply a name-plausibility filter and discard establishments it doesn't recognize as food — overriding the obvious "**ProperNoun** in **City**" signal. It is **inconsistent**: it kept comparably bare names elsewhere ("Il Barone", "Volcano Burger", "Molcajete in fv"). The adversarial recheck upheld 10 of these 11 as genuine errors (`oe06xyh` "Double bamboo" judged ambiguous and is *not* counted here).

---

## Finding 2 — 2 genuine fabrications / grounding errors

- **`oe07tk6`** — *"Ake Larry i believe its in orange? Tiny little Italian fusion restaurant…"* — gemma extracted `name: "Italian fusion restaurant"` and **missed the actual name "Ake Larry."** It inverted name and description — a real grounding failure (double error: bad name + missed name).
- **`oe1oayp`** — *"…They also just opened **a wine tasting place** right around the corner…"* — gemma extracted `name: "wine tasting place"`. That is a generic noun phrase, not an establishment name. (Legacy made the same mistake — this error is **currently live in the dataset**.)

These are the only two cases where gemma asserted something the text doesn't support. Both would create junk entries downstream.

---

## Finding 3 — `cuisine` is badly under-populated

Among comments where the **name matched**, gemma left `cuisine: null` in **45** cases the oracle filled. Split:

- **21 — cuisine word literally in the name** → genuine under-extraction. Examples: "Peter's **Burgers**"→null, "Gary's **Deli**"→null, "Ray's **Pizza**"→null, "Tama **Sushi**"→null, "Saffron **Bakery**"→null, "Confetti Italian **Ice** and Custard"→null. The contract says "cuisine type **if inferable**" — here it is trivially inferable.
- **24 — requires world knowledge** (e.g. "El Farolito"→Mexican, "Taste of Burma"→Burmese, "Twenty Eight Restaurant"→Steakhouse from "Amazing steaks"). The adversarial recheck ruled gemma's `null` here **defensible** — a small model declining to guess is contract-compliant.
- **14 — both filled, differ in specificity** (e.g. gemma "Korean" vs oracle "Korean BBQ"; gemma "Japanese" vs "Sushi") — both acceptable.

Net: roughly half the cuisine gap is real under-extraction; half is reasonable caution. Either way, **a cuisine filter built on this data would be ~⅓ less complete than it should be.**

---

## Finding 4 — Fairness: where gemma is equal, better, or the oracle is wrong

The test cuts both ways. Confirmed cases gemma got **right** that the oracle did not, or that vindicate gemma:

- **`oe212js` (Wok-In)** — text says "vietnamese **and chinese** food." gemma: `"Vietnamese and Chinese"` (faithful). Oracle dropped "Chinese." **Oracle under-extracted.**
- **`oe4rlij` (Okazya Kitchen)** — "best teriyaki chicken bowls." gemma: `"Japanese"`. Oracle: `null`. **gemma better.**
- **`oe3a3x4` (Sabatino's)** — *"still in mourning over **the closure of** Sabatino's… For places **still open**, there is…"* gemma correctly **excluded** the closed place; the oracle extracted it. **Oracle over-reach.**
- **`oe00mrp` (Mitasie)** — text describes two distinct locations ("their original location in HB… a full service sit down restaurant unlike their LF location"). gemma split into two entries; the oracle collapsed to one. gemma's reading is text-supported — **not** an error (my initial "duplicate" flag was refuted).
- **`oeaty1s`** — gemma expanded "SNA" → Santa Ana (correct); the oracle left it null (over-strict).
- **`oe2ymx3`** — the known trap ("King's Donuts in MV… Mitasie LF"). The **legacy** data mis-mapped these to "Monte Vista" and "Los Feliz" (both outside Orange County). gemma left "MV"/"LF" literal and **avoided that error.**

---

## Finding 5 — Ambiguous cases (prompt gap, not a model defect)

The prompt does not say how to treat establishments that are **named but closed / nostalgic** ("Does anyone remember Mascarpone's?", "BRING BACK MEXICASA", the closed Sabatino's). Both models are inconsistent here, in opposite directions. This is a **specification gap**, and should be resolved in the prompt before blaming either model. Also ambiguous: dish-vs-name tokens ("mi la cay", "Xe com tam").

---

## Downstream impact (reasoned; geocode/DB not run)

The LLM stage feeds aggregation → geocoding → map/list. gemma's specific errors would propagate as:

- **11 dropped recs → 11 fewer restaurants** on the map and list. Silent; nothing flags the loss.
- **`oe19rlt`: "Pour Co." location = "Mitasie"** (a restaurant name used as a city) → geocode miss or a wrong pin.
- **"wine tasting place" / "Italian fusion restaurant"** → junk pins; and "Ake Larry" is missing entirely.
- **43% cuisine coverage** → a weaker cuisine filter and weaker dedup signal.
- Note the pipeline **only extracts top-level comments** anyway; combined with gemma's drops, recall is doubly constrained.

---

## Answering the three questions you posed

- **Grounding in fact?** Mostly **yes** — precision ≈ 0.99; only 2 unsupported outputs. It does not invent restaurants.
- **Sound judgement?** **Inconsistent.** Reasonable on many calls (even beating the oracle a few times), but its name-plausibility filtering and erratic cuisine inference are not principled.
- **No mistakes?** **No.** ~16 missed establishments (11 whole-comment drops), 2 fabrications, 1 location error, and systematic cuisine under-population.

### Suggested follow-ups (optional)
1. Add 2–3 **few-shot examples** to `SYSTEM_PROMPT`, including a terse "**Name** in **City**" → must-extract case and a non-foody-name case, to fix the silent drops.
2. Specify **closed/nostalgic** handling explicitly in the prompt.
3. Consider a cheap **post-validation** pass (or a larger model — `gemma4:26b` is installed) for comments where the model returns `[]`, to catch dropped recs.
4. **Scrub the live dataset** for the same legacy errors surfaced here ("wine tasting place"; verify the King's Donuts/Mitasie locations).

---

## Methodology & reproducibility

- **Same input to both:** comment bodies frozen in `comments.jsonl` via the pipeline's own `parse_reddit_json` + `flatten_comment_tree` + `normalize_text`. Oracle shards are **body-only** (`comment_id`,`body`) — confirmed.
- **Blind oracle:** 3 parallel subagents read only their shard; gemma's output never in view.
- **gemma:** `scripts/ab_extract.py run-gemma` → real `default_extract_entities` (gemma4:latest). **Deterministic** (re-run byte-identical at temp 0).
- **Adversarial recheck:** independent verifier steelmanned gemma (upheld 14 error calls, refuted 1, found 1 oracle over-reach + cuisine over-counting) — folded into the adjudication above.
- **Integrity:** 129/129/129 records, 0 gemma errors, categories sum to 129.

### Artifacts (`data/threads/orangecounty-1sb0qo7/ab-test/`)
`comments.jsonl` (frozen inputs) · `gemma4.jsonl` (System B + raw) · `claude.jsonl` (blind oracle) · `comparison.csv` (per-comment adjudicated) · `comparison_auto.csv` (mechanical diff) · `disagreements.jsonl` (the 70 contested) · `REPORT.md`.
Harness: `scripts/ab_extract.py`. **Nothing live was modified** — not `processed/`, the DB, the geocode cache, or the published dataset.
