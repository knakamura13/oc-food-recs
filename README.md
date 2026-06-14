# OC Food Recs

![Build Status](https://img.shields.io/github/actions/workflow/status/knakamura13/oc-food-recs/ci.yml?branch=main)
![Last Commit](https://img.shields.io/github/last-commit/knakamura13/oc-food-recs)
![License](https://img.shields.io/github/license/knakamura13/oc-food-recs)
![Node.js](https://img.shields.io/badge/Node.js-18+-success)

A community-driven restaurant explorer for Orange County, CA — built from real Reddit recommendations.

**Live site:** [oc-food-recs-production.up.railway.app](https://oc-food-recs-production.up.railway.app/)

---

## About

OC Food Recs aggregates mom-and-pop restaurant recommendations mined from [r/orangecounty](https://www.reddit.com/r/orangecounty/) threads — starting with a popular [thread](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/) asking _"What's your favorite mom-and-pop restaurant in OC?"_

The result is an interactive map + list explorer where you can:

- Browse restaurants on an interactive Leaflet map with marker clustering
- Filter by cuisine type or city
- Search by restaurant name, cuisine, or location (fuzzy search via Fuse.js)
- Sort by community score or name
- View the original Reddit comment, endorsements, and dish recommendations for each restaurant
- Share filtered views via URL parameters

---

## Tech Stack

| Layer         | Technology                                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | [SvelteKit](https://kit.svelte.dev/) 2.x with Svelte 5                                                                                                                                                   |
| Language      | TypeScript                                                                                                                                                                                               |
| Database      | [PostgreSQL](https://www.postgresql.org/) via [Drizzle ORM](https://orm.drizzle.team/), hosted on Railway                                                                                                |
| Map           | [Leaflet](https://leafletjs.com/) + [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)                                                                                            |
| Search        | [Fuse.js](https://www.fusejs.io/) (fuzzy search)                                                                                                                                                         |
| Data pipeline | Python — [BeautifulSoup](https://www.crummy.com/software/BeautifulSoup/) scraping, local [Gemma 3](https://ai.google.dev/gemma) extraction via [Ollama](https://ollama.com/), Google/Nominatim geocoding |
| Build         | Vite 8                                                                                                                                                                                                   |
| Deployment    | [Railway](https://railway.com?referralCode=QCz9lp) (Node.js adapter)                                                                                                                                     |

---

## Data

The app is **server-rendered live from a PostgreSQL database** (hosted on Railway). There is no static dataset checked into the repo — [`src/routes/+page.server.ts`](src/routes/+page.server.ts) runs the read queries on every request through Drizzle ([`src/lib/server/db`](src/lib/server/db)).

The schema ([`src/lib/server/db/schema.ts`](src/lib/server/db/schema.ts)) has four tables:

- **`threads`** — one row per ingested Reddit thread
- **`restaurants`** — one row per distinct restaurant (name, slug, location, street, cuisine, lat/lng)
- **`mentions`** — one row per comment that mentions a restaurant: `primary` introductions plus classified `endorsement` replies (dish recs, personal stories, secondary endorsements)
- **`geocode_cache`** — cached geocoding results, including smart negative caching for failed lookups

Aggregate community score and mention count are **not stored** — they're derived at query time from `mentions`, so they can't drift out of sync.

### Ingest pipeline

The database is populated by the Python pipeline in [`scripts/`](scripts/) (driven by [`reddit_pipeline.py`](scripts/reddit_pipeline.py)):

1. **Scrape & parse** a saved Reddit thread HTML export into a structured comment tree
2. **Extract** restaurant mentions (name, location, street, cuisine) from each comment with a local [Gemma 3](https://ai.google.dev/gemma) model via [Ollama](https://ollama.com/)
3. **Geocode** each restaurant (Google Geocoding with a Nominatim fallback), caching results in `geocode_cache`
4. **Upsert** threads, restaurants, and mentions into Postgres, deduplicating restaurants across threads

Ingestion runs from the CLI ([`reddit_pipeline.py`](scripts/reddit_pipeline.py)). Admin routes handle geocode corrections ([`/admin/geocode`](src/routes/admin/geocode)) and chain/corporate exclusions ([`/admin/exclusions`](src/routes/admin/exclusions)). See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/INGEST_TRACKING.md`](docs/INGEST_TRACKING.md) for ingest workflow.

---

## Running Locally

**Prerequisites:** Node.js 18+, Python 3.9+ (for the ingest pipeline), and a PostgreSQL connection string.

The app is fully server-rendered from Postgres with **no fallback data path** — it returns HTTP 500 on every request when `DATABASE_URL` is unset. Copy the example env file and point it at your database:

```sh
cp .env.example .env
# then set DATABASE_URL=postgres://… in .env
```

```sh
# Install dependencies
npm install

# Start the development server
npm run dev

# Open in browser automatically
npm run dev -- --open
```

**Database commands** (Drizzle Kit):

```sh
npm run db:generate   # generate a migration from schema changes
npm run db:migrate    # apply pending migrations
npm run db:push       # push the schema directly (dev)
npm run db:studio     # open Drizzle Studio
```

**Other commands:**

```sh
# Type-check the project
npm run check

# Build for production
npm run build

# Preview the production build locally
npm run preview

# Run the production build (after npm run build)
npm start
```

### Python pipeline

For ingest and maintenance scripts:

```sh
pip install -e .

# Pull the default extraction model (or set OC_FOOD_RECS_OLLAMA_MODEL)
ollama pull gemma4:latest

# Run pipeline unit tests
npm run test:pipeline
```

Ollama env vars: `OC_FOOD_RECS_OLLAMA_URL`, `OC_FOOD_RECS_OLLAMA_MODEL`, `OC_FOOD_RECS_OLLAMA_THINK`. See [`.env.example`](.env.example).

### Testing

```sh
npm test              # Vitest (unit + component)
npm run test:all      # Vitest + Python pipeline tests
npm run test:e2e      # Playwright (requires DATABASE_URL; dev server on port 5174)
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for CI, worktree `.env` setup, and admin auth.

---

## Performance

The main page server-renders the full restaurant dataset on each request. List mention payloads omit comment bodies (loaded on expand via `/api/r/[slug].json`); dish highlights use lightweight SQL aggregates.

Revisit architecture if the dataset exceeds ~500 restaurants or TTFB consistently exceeds ~1s. Future options: server-side filter endpoint, cursor pagination, or edge caching of read-only aggregates.

Monitor growth via `GET /api/health` (`restaurant_count`, `thread_count`, `mention_count`).

---

## Deployment

This app is deployed on [Railway](https://railway.com?referralCode=QCz9lp) using the Node.js adapter (`@sveltejs/adapter-node`). The `railway.toml` config at the project root handles build and startup steps.

To deploy your own instance:

1. Fork this repo
2. Create a new project on [Railway](https://railway.com?referralCode=QCz9lp) and connect your GitHub repo
3. Railway will auto-detect the `railway.toml` and deploy on every push to `main`

---

## Project Structure

```
src/
├── lib/
│   ├── restaurants/
│   │   ├── components/
│   │   │   ├── Hero.svelte             # Page header with title and stats
│   │   │   ├── SearchBar.svelte        # Fuzzy search (Fuse.js) with autocomplete
│   │   │   ├── FilterBar.svelte        # Cuisine / city / subreddit filter chips
│   │   │   ├── Map.svelte              # Leaflet map with clustered markers
│   │   │   ├── RestaurantList.svelte   # Virtualized restaurant cards
│   │   │   ├── RecencyHistogram.svelte # Mention-recency filter
│   │   │   └── BackToTop.svelte
│   │   ├── filter-restaurants.ts       # Client-side filtering / sorting
│   │   ├── stores.svelte.ts            # Svelte 5 runes-based global state
│   │   └── types.ts                    # TypeScript interfaces
│   └── server/
│       ├── db/                         # Drizzle client + Postgres schema
│       └── geocode/                    # Geocode health + admin-correction helpers
└── routes/
    ├── +page.server.ts                 # Live DB load (one row per restaurant)
    ├── +page.svelte                    # Main page (split map + list view)
    ├── admin/                          # Geocode corrections + exclusion review
    └── api/r/[slug].json/              # On-demand per-restaurant mention detail

scripts/                                # Python ingest pipeline (reddit_pipeline.py, …)
docs/                                   # Ingest tracking and contributor docs
```
