# Contributing to OC Food Recs

## Prerequisites

- Node.js 18+
- Python 3.9+
- PostgreSQL (`DATABASE_URL` required — no mock/fallback data path)
- [Ollama](https://ollama.com/) for pipeline extraction (local only)

## Environment setup

```sh
cp .env.example .env
# Set DATABASE_URL and optional GOOGLE_MAPS_API_KEY, ADMIN_PASSWORD
```

**Git worktrees** do not inherit `.env`. Copy from the main checkout:

```sh
cp ../../../.env .env   # from .claude/worktrees/<name>/
```

### Ollama (pipeline only)

```sh
ollama pull gemma4:latest
# Or set OC_FOOD_RECS_OLLAMA_MODEL to your preferred tag
```

Env vars: `OC_FOOD_RECS_OLLAMA_URL`, `OC_FOOD_RECS_OLLAMA_MODEL`, `OC_FOOD_RECS_OLLAMA_THINK`. Legacy `OLLAMA_URL` / `OLLAMA_MODEL` also work.

## Install

```sh
npm install
pip install -e .
```

## Development

```sh
npm run dev
npm run check
```

Admin routes (`/admin/geocode`, `/admin/exclusions`) require `ADMIN_PASSWORD` in production; locally they are open when unset.

## Testing

```sh
npm test                  # Vitest unit/component tests
npm run test:pipeline     # Python pipeline tests
npm run test:all          # Vitest + pipeline
npm run test:e2e          # Playwright (requires DATABASE_URL, port 5174)
```

### CI

GitHub Actions runs `check`, `test`, and `test:pipeline` on every push. Playwright e2e runs only when the `DATABASE_URL` repository secret is configured.

## Ingest pipeline

Ingestion is **CLI-only** via [`scripts/reddit_pipeline.py`](scripts/reddit_pipeline.py). See [`docs/INGEST_TRACKING.md`](docs/INGEST_TRACKING.md) for the thread checklist.

```sh
python3 scripts/reddit_pipeline.py init-thread --html path/to/thread.html
python3 scripts/reddit_pipeline.py build-thread --thread <thread-id>
python3 scripts/reddit_pipeline.py ingest --thread <thread-id>
```

## Maintenance scripts

```sh
npm run pipeline:geocode-health   # geocode cache health report
python3 scripts/audit_comment_dates.py
python3 scripts/backfill_comment_dates.py [--dry-run]
python3 scripts/backfill_permalinks.py [--dry-run]
python3 scripts/analyze_unmapped.py --csv unmapped.csv
```

## Code style

See [`CLAUDE.md`](CLAUDE.md): tabs, single quotes, Svelte 5 runes, scoped CSS, no Prettier.
