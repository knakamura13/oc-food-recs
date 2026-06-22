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
# Drop HTML exports in data/uningested-threads/, then:
npm run pipeline:ingest-batch

python3 scripts/reingest_all_threads.py   # re-ingest all known threads
npm run pipeline:geocode-health           # geocode cache health
python3 scripts/analyze_unmapped.py --csv unmapped.csv
```

## Next threads

Track progress in [GitHub issue #18](https://github.com/knakamura13/oc-food-recs/issues/18). To add a thread:

1. Export/save the Reddit thread HTML.
2. Place it in [`data/uningested-threads/`](../data/uningested-threads/) (see README there).
3. Run `npm run pipeline:ingest-batch` (or the per-thread checklist below).
4. Verify on the public site; update issue #18 with the new thread row and counts from `GET /api/health`.

## Maintenance

```sh
npm run pipeline:audit-comment-dates
npm run pipeline:backfill-comment-dates [-- --dry-run]
npm run pipeline:backfill-permalinks [-- --dry-run]
npm run pipeline:apply-exclusions
python3 scripts/dedupe_restaurants.py          # review duplicate groups (dry run)
python3 scripts/dedupe_restaurants.py --apply  # merge high-confidence duplicates
python3 scripts/find_duplicate_candidates.py --csv duplicates.csv  # audit near-miss pairs
```

## Admin review

- [`/admin/geocode`](/admin/geocode) — fix failed geocodes
- [`/admin/exclusions`](/admin/exclusions) — confirm or restore `pending_review` / excluded restaurants

Ingestion is **CLI-only** (no web ingest UI).
