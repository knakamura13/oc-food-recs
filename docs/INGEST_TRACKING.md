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
4. Preview extraction/geocoding (this can call models and Maps and update the local geocode cache):
   ```sh
   python3 scripts/reddit_pipeline.py ingest --html path/to/thread.html --dry-run
   ```
5. Review the complete source and preview, then publish:
   ```sh
   python3 scripts/reddit_pipeline.py ingest --html path/to/thread.html
   ```
6. Verify the actual thread ID and counts in the intended database and on the public site; update issue #18.

`init-thread` / `build-thread` are optional local review stages. `ingest --html` extracts again; it does not publish their generated artifacts. `--limit` is diagnostic-only and requires `--dry-run`, because a partial refresh can prune existing mentions. Malformed extraction results and known unresolved comment-tree markers abort before publication. An absence of known markers alone does not prove a source is complete. Refreshes preserve a thread's existing publication flag and source takedown tombstones.

## Resumable local queue

The standard-library queue stores only canonical identities, capture presence, attempts, ownership leases and verified result counts. It has no network, model or database access. It requires POSIX file locking (macOS/Linux). State stays in ignored `output/`.

```sh
python3 scripts/ingest_queue.py import --audit output/automation-audit/2026-10-05-backlog.json
python3 scripts/ingest_queue.py import --urls output/ingestion/new-urls.txt
python3 scripts/ingest_queue.py status
python3 scripts/ingest_queue.py claim <post-id>
# Use the returned claim_token for renewal and completion/failure:
python3 scripts/ingest_queue.py renew <post-id> --token <claim-token>
python3 scripts/ingest_queue.py fail <post-id> --token <claim-token> --reason 'capture incomplete'
python3 scripts/ingest_queue.py recover
# Only after independent intended-database publication verification:
python3 scripts/ingest_queue.py finish <post-id> --token <claim-token> --thread-id <subreddit-post-id> --restaurants <count> --mentions <count>
```

`--queue <path>` can select a different state file and must precede the subcommand. Imports deduplicate on Reddit post ID, reconcile known skips/rejections and never turn a saved capture into completed ingestion. Historical checked tracker entries are not imported as verified database results. Only queued/failed records can be claimed; complete/skipped/rejected records are terminal. A running record requires its unexpired token for renewal/completion/failure, and an import cannot silently revoke that ownership. Expired claims recover to failed for explicit retry. Keep failure reasons short and free of credentials or source text; the queue does not redact supplied reasons.

## Browser capture

Official Reddit API access is unavailable for this project, and Reddit blocks automated browsers ("You've been blocked by network security"), so capture runs in the owner's everyday Chrome, one bookmark click per thread. Do not try to make an automated browser look like a person; that is bot-detection evasion.

```sh
npm run pipeline:capture-bookmarklet                 # pending queue records
npm run pipeline:capture-bookmarklet -- <thread-url> # or specific threads
```

This writes `output/ingestion/capture-bookmarklet.html`. Open it in Chrome and drag its link onto the bookmarks bar. Click the bookmark on any Reddit page to open the first pending thread. Once the thread loads, click it again: it runs the reusable expander (`scripts/browser/capture-reddit-thread.js`, derived from the original exporter kept in `original-reddit-exporter.js`), downloads `<subreddit>-<post-id>.html` and opens the next pending thread. If a thread can't be saved, a dialog gives the reason and the blocking elements; OK skips it for this bookmark, and Cancel stays so you can click again.

Then file the downloads and rebuild the bookmark so it drops filed threads:

```sh
npm run pipeline:file-captures            # reads ~/Downloads; --from <dir> to change
npm run pipeline:capture-bookmarklet
```

Filing checks each download's metadata comment, status and post identity, writes the bare `#main-content` HTML (the same markup the original exporter saved) and a `<subreddit>-<post-id>.capture.json` sidecar (status, counts, blockers, sha256) to `output/ingestion/captures/`, and moves the original into `captures/downloads/`. Files without the metadata comment are left alone, and rejected ones stay in Downloads with the reason printed. Statuses:

- `captured`: settled with at least the advertised comment count.
- `shortfall`: settled, but up to 5 comments (or 5%) under the advertised count. Reddit counts can include deleted or removed comments. Kept for review and never labeled complete.
- `incomplete` (not saved): an expander, comment partial or busy marker stayed visible, the shortfall was larger, or the page was not a full thread.

The queue file is only read, and a filed capture is not ingestion: publish with `ingest --html` and verify before `finish`.

## Batch operations

```sh
# Drop HTML exports in data/uningested-threads/, then:
npm run pipeline:ingest-batch
railway cdn purge html                    # public pages are edge-cached for up to 5 min; purge so new data shows now

python3 scripts/reingest_all_threads.py   # re-ingest all known threads
npm run pipeline:geocode-health           # geocode cache health
python3 scripts/analyze_unmapped.py --csv unmapped.csv
```

## Next threads

Track progress in [GitHub issue #18](https://github.com/knakamura13/oc-food-recs/issues/18). To add a thread:

1. Export/save the Reddit thread HTML.
2. Place it in [`data/uningested-threads/`](../data/uningested-threads/) (see README there).
3. Run `npm run pipeline:ingest-batch`, then `railway cdn purge html` (or the per-thread checklist below).
4. Verify on the public site; update issue #18 with the new thread row and counts from `GET /api/health`.

## Maintenance

```sh
npm run pipeline:audit-comment-dates
npm run pipeline:backfill-comment-dates [-- --dry-run]
npm run pipeline:backfill-permalinks [-- --dry-run]
npm run pipeline:apply-exclusions
npm run pipeline:backfill-chain-policy                 # dry-run seed + classify
npm run pipeline:backfill-chain-policy -- --apply      # write denylist + status/confidence
python3 scripts/dedupe_restaurants.py          # review duplicate groups (dry run)
python3 scripts/dedupe_restaurants.py --apply  # merge high-confidence duplicates
python3 scripts/find_duplicate_candidates.py --csv duplicates.csv  # audit near-miss pairs
```

## Admin review

- [`/admin/geocode`](/admin/geocode) — fix failed geocodes
- [`/admin/exclusions`](/admin/exclusions) — confirm or restore `pending_review` / excluded restaurants

Ingestion is **CLI-only** (no web ingest UI).
