# Read-only chain scorer

Issue #200 evaluates the policy in #199. This tool does not apply classifications,
update the registry, ingest threads, or change public restaurant visibility. Those
changes belong to #201.

## Install

Use a dedicated Python environment. Install the pipeline dependencies and the
optional `chain-scorer` extra from `pyproject.toml`. The scorer uses psycopg,
DuckDB/httpfs, requests, ijson and tldextract. Tests use synthetic data and need no
network, Ollama or database:

```sh
python3 -m pip install -e '.[chain-scorer]'
python3 -m unittest tests.test_chain_scorer
```

## Scratch database

Restore the exact issue input `prod-pre-154-20261001T035812Z.dump` using Postgres 18
into a dedicated local database whose name ends in `_scratch`. Do not load the
main checkout's `.env`: its `DATABASE_URL` is production. The scorer never reads
`.env` or `DATABASE_URL`; `--scratch-dsn` is mandatory and remote hosts/service
aliases are rejected.

Create a separate SELECT-only role for the scorer. `snapshot()` also forces a
read-only transaction, checks database identity and takes a SHA256 fingerprint of
every public table before and after the run. Publication columns in later schema
versions are not assumed to exist in this older backup.

## Sources and models

- Overture is pinned to release `2026-09-23.1`. A local identity match uses names
  and a 250 m coordinate radius, or exact name/city for rows without coordinates.
  The second query scans worldwide and retains relevant domain/name rows.
- NSI's fourteen food-category files are pinned to a recorded Git commit. Brand
  prefixes are token-based; leading `the`, apostrophes and `&` are normalized.
  Generic single tokens are skipped. A brand match alone is not a decision.
- ATP is pinned to run `2026-09-26-13-32-25`, downloaded from
  `https://alltheplaces-data.openaddresses.io/runs/2026-09-26-13-32-25/output.zip`.
  Its GeoJSON collections are streamed. Malformed input files are recorded.
- Shared ordering, social, and site-builder domains are excluded. Registrable
  domains use the bundled public-suffix list, including private suffixes.
- Distinct locations use meter-sized spherical Cartesian cells and a 60 m
  great-circle distance check, including high latitudes and the date line.
- Jev is pinned to `typesafe/jev-1.13`. The adapter reads `OPENROUTER_API_KEY` or the
  macOS Keychain's `openrouter-api-key`; keys are never written to artifacts.
  Public comment text goes to OpenRouter without author handles. Website evidence
  is fetched with limits on redirects, response size, and request time; nonpublic
  destinations are rejected.
- Jev sees the restaurant's city, local-match provenance, source URL and text.
  A small total additionally requires a verified official publisher. Known
  platforms and third-party directories/press sites are ineligible. Each numeric
  candidate is checked in its quoted context, independently of whole-page chain
  evidence; postal codes, closed sites and unrelated counts do not qualify.
- Gemma uses local Ollama `gemma4:31b`, `think: false`, JSON, temperature 0.
  It sees supplied evidence with URLs and publisher checks; a quoted numeric count
  must actually occur in a source. Alternatively, six or more distinct operating
  street-address entries can establish a positive lower bound. Each entry must
  quote its exact address and city from a supplied source. Repeated addresses,
  unit variations, closed sites and planned locations are rejected. Lists never
  establish completeness or independence. This validator recognizes common
  English street suffixes and Spanish street prefixes; other address formats
  can still use an explicit numeric count.
  Empty evidence, unsupported claims and explicit abstentions cannot exclude a row.

Observed location counts are lower bounds. Six or more identity-matched locations
can establish a chain; five observed listings cannot establish independence.
Independence requires an official source's explicit complete current total.
Conflicting evidence abstains. Restaurants without evidence remain `unknown`.
These are evaluation decisions; the report must judge their precision before #201
uses them to remove restaurants automatically.

## Run and resume

Keep all output and source caches in ignored directories. They contain real Reddit
text and must never be committed. Supply the downloaded ATP archive for the first
run; later runs use its compact cache, including the archive's SHA256.

```sh
python3 scripts/chain_evaluate.py \
  --scratch-dsn 'postgresql://READER:PASSWORD@127.0.0.1:PORT/NAME_scratch' \
  --cache output/chain-cache \
  --output output/chain-evaluation \
  --atp-zip /absolute/path/output.zip
```

HTTP/model requests are cached by exact input hash. Identical concurrent model
requests share one call. Model failures retry on the next invocation; they are
never converted into evidence of independence. Successful requests resume without
calling the model again. A changed restaurant selection invalidates the global
source cache. A hash-verified superset selection can serve a narrower domain
allowlist without rescanning the global release. Source failures and truncation
remain visible in the artifacts.

Use `--prepare-only` while local model work is unavailable. It stops before all
Gemma calls, writes `preparation-summary.json`, and verifies the database is
unchanged. This is an explicitly incomplete stage, not a completed evaluation.

Outputs include `results.jsonl` (one row per active restaurant plus excluded-chain
control rows), `summary.json`, before/after table fingerprints, source manifests,
website failures, per-source probabilities, and Gemma response/grounding evidence.
Separate active/control counts before reporting recall. The acceptance report also
includes the 62-item Jev/Gemma comparison, all F6 disagreements, and official-source
checks around the five/six/seven boundary. Dataset labels are proxies rather than
human-audited truth; unmatched comparison items must stay unlabeled.
Overall recall uses every positive reference label; abstentions count as misses.
Conditional recall/accuracy and response coverage are reported separately, along
with raw zero-confidence answers. A Boolean false with zero confidence is not
evidence that a restaurant is independent.
