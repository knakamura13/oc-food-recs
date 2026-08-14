# AGENTS.md — oc-food-recs

See [`README.md`](README.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full
architecture, standard commands, and pipeline workflow. Code-style rules live in
[`CLAUDE.md`](CLAUDE.md) (tabs, single quotes, Svelte 5 runes, no Prettier).

## Cursor Cloud specific instructions

The environment is pre-provisioned by a VM snapshot. Node deps (`npm install`) and the
Python pipeline (`pip install -e .`) are refreshed automatically on startup by the update
script. The items below are the non-obvious, per-boot caveats.

### PostgreSQL must be started manually each session

The app is server-rendered live from Postgres with **no fallback data path**, so it returns
HTTP 500 on every request when the DB is unreachable. A local PostgreSQL 16 cluster with the
`ocfoodrecs` dev database is baked into the snapshot, but the service does **not** auto-start.
Start it at the beginning of each session:

```sh
sudo pg_ctlcluster 16 main start   # idempotent; safe if already running
```

- Connection string is already set in the gitignored `/workspace/.env`:
  `DATABASE_URL=postgresql://ocfood:ocfood@localhost:5432/ocfoodrecs` (role `ocfood`, password `ocfood`).
- If the DB is empty (e.g. fresh cluster), apply schema + fixtures:
  `npm run db:migrate` then `E2E_SEED=1 npm run db:seed-e2e` (2 restaurants / 2 mentions).
- Verify data with `curl -s localhost:5173/api/health` (returns row counts) once the dev server runs.

### Running / testing

- Dev server: `npm run dev` (defaults to Vite's port; the setup demo used `--port 5173`).
  `npm run check`, `npm test` (Vitest), and `npm run test:pipeline` (Python) run without extra setup.
- Playwright e2e (`npm run test:e2e`) starts its own dev server on port **5174** and reads the same
  `.env` DATABASE_URL; the browser is installed in the snapshot. It relies on the seeded fixture data.
- `.nvmrc` pins Node 20.19.0, but the snapshot's Node 22.x satisfies Vite 8 and runs all commands fine.

### Not available in this environment

The Python **ingest** pipeline (`scripts/reddit_pipeline.py`) needs a local **Ollama** LLM and
optionally `GOOGLE_MAPS_API_KEY` for geocoding — neither is provisioned. The pipeline **unit tests**
(`npm run test:pipeline`) do not require them and pass standalone. Full ingestion is out of scope
for cloud dev unless those are added.
