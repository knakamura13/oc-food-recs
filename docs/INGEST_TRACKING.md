# Ingest tracking

Track Reddit thread ingestion progress in [GitHub issue #18](https://github.com/knakamura13/oc-food-recs/issues/18).

## CLI ingest checklist

For each new thread HTML export:

1. Save HTML under `data/threads/<thread-id>/raw/thread.html` (or `data/threads/<thread-id>.html`).
2. Initialize thread metadata:
   ```sh
   python3 scripts/reddit_pipeline.py init-thread --html path/to/thread.html
   ```
3. Build structured comment tree + LLM extraction:
   ```sh
   python3 scripts/reddit_pipeline.py build-thread --thread <thread-id>
   ```
4. Geocode and upsert into Postgres:
   ```sh
   python3 scripts/reddit_pipeline.py ingest --thread <thread-id>
   ```
5. Verify on the public site and update issue #18.

## Batch operations

```sh
python3 scripts/reingest_all_threads.py   # re-ingest all known threads
npm run pipeline:geocode-health           # geocode cache health
python3 scripts/analyze_unmapped.py --csv unmapped.csv
```

## Maintenance

```sh
python3 scripts/audit_comment_dates.py
python3 scripts/backfill_comment_dates.py [--dry-run]
python3 scripts/backfill_permalinks.py [--dry-run]
npm run pipeline:apply-exclusions
```

## Admin review

- [`/admin/geocode`](/admin/geocode) — fix failed geocodes
- [`/admin/exclusions`](/admin/exclusions) — confirm or restore `pending_review` / excluded restaurants

Ingestion is **CLI-only** (no web ingest UI).
