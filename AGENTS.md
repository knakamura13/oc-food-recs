# AGENTS.md

Project-agnostic contributor guidance lives in [`README.md`](README.md),
[`CONTRIBUTING.md`](CONTRIBUTING.md), and [`CLAUDE.md`](CLAUDE.md) (code style +
DB notes). Standard commands are defined in `package.json` scripts — prefer those
over duplicating them here.

## Cursor Cloud specific instructions

This is **OC Food Recs**: a SvelteKit 2 / Svelte 5 web app server-rendered live from
PostgreSQL (Drizzle ORM), plus a Python Reddit-ingest pipeline. The web app has **no
fallback data path** — every page returns **HTTP 500** unless `DATABASE_URL` points at a
reachable Postgres. There is one product (the explorer web app); the Python pipeline is a
supporting CLI whose unit tests run fully offline.

### Local Postgres (the cloud dev database)

The cloud VM does **not** have the Railway production DB. Instead a **local Postgres 16**
cluster is provisioned in the snapshot, mirroring the CI service, with a fixture dataset:

- Connection: `DATABASE_URL=postgresql://test:test@localhost:5432/e2e` (already written to
  the gitignored `.env`, which the dev server, drizzle-kit, and seed script all read via
  `dotenv`). Do **not** point cloud QA at the Railway DB.
- The DB is loaded with the e2e fixture (1 thread, 2 restaurants — "La Taco Spot" and
  "Ramen House" — 2 mentions). Loads are read-only `SELECT`s.

**Start Postgres if it isn't running** (it does not auto-start on boot):

```sh
sudo pg_ctlcluster 16 main start   # then: sudo pg_lsclusters  (Status should be "online")
```

If the cluster ever loses its data (e.g. a fresh cluster), recreate role/db and reseed:

```sh
sudo -u postgres psql -c "CREATE ROLE test LOGIN PASSWORD 'test' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE e2e OWNER test;"
npm run db:migrate
E2E_SEED=1 npm run db:seed-e2e   # E2E_SEED=1 is required — the seed refuses non-fixture DBs
```

### Running / testing (all require Postgres up + `.env` present)

- Dev server: `npm run dev` (port 5173). Verify with `curl -s localhost:5173/api/health`
  → `{"ok":true,"restaurant_count":2,...}`.
- Type-check: `npm run check`. Unit/component tests: `npm test` (vitest, jsdom — no DB
  needed). Python pipeline tests: `npm run test:pipeline` (no DB needed).
- E2E: `npm run test:e2e` — Playwright starts its own dev server on **port 5174** and
  reads the seeded DB. Chromium is installed in the snapshot; run
  `npx playwright install chromium` if missing. The Mobile Chrome project's cases show as
  "skipped" under Desktop Chrome — that is expected, not a failure.

### Gotchas

- Node: `/exec-daemon/node` (v22.x) is force-injected at the front of `PATH`, so it wins
  over nvm regardless of `.nvmrc` (20.19.0). v22 satisfies the repo's Node 18+/Vite 8
  requirement; everything (install, check, test, build, dev, e2e) passes on it.
- Never run Prettier (see `CLAUDE.md`). Indent with tabs, single quotes, Svelte 5 runes.
- The Python pipeline's *ingest* (not its tests) needs a local Ollama model + Google Maps
  key; neither is set up here and neither is needed to run the web app or the test suites.
