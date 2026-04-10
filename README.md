# OC Food Recs

A community-driven restaurant explorer for Orange County, CA — built from real Reddit recommendations.

**Live site:** [oc-food-recs-production.up.railway.app](https://oc-food-recs-production.up.railway.app/)

---

## About

OC Food Recs aggregates 289 mom-and-pop restaurant recommendations from a popular [r/orangecounty Reddit thread](https://www.reddit.com/r/orangecounty/comments/1sb0qo7/) asking *"What's your favorite 'mom and pop' family owned restaurant?"* — which received 735 responses. Comments were parsed and structured using a local LLM, then geocoded for map display.

The result is an interactive map + list explorer where you can:

- Browse restaurants on an interactive Leaflet map with marker clustering
- Filter by cuisine type or city
- Search by restaurant name, cuisine, or location (fuzzy search via Fuse.js)
- Sort by community score or name
- View the original Reddit comment, endorsements, and dish recommendations for each restaurant
- Share filtered views via URL parameters

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [SvelteKit](https://kit.svelte.dev/) 2.x with Svelte 5 |
| Language | TypeScript |
| Map | [Leaflet](https://leafletjs.com/) + [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) |
| Search | [Fuse.js](https://www.fusejs.io/) (fuzzy search) |
| Build | Vite 8 |
| Deployment | [Railway](https://railway.com?referralCode=QCz9lp) (Node.js adapter) |

---

## Data Source

Restaurant data is stored as a static JSON file (`src/lib/data/restaurants.json`) generated from scraping and processing the Reddit thread. Each entry includes:

- Restaurant name, location, and cuisine type
- Geocoordinates (278 of 289 restaurants are mapped)
- Aggregate community score and mention count
- The original recommending comment (author, body, score, permalink)
- Endorsements: personal stories, dish recommendations, and secondary endorsements from replies

The data was extracted using a local [Gemma 3 12B](https://ai.google.dev/gemma) model and geocoded via a geocoding API.

---

## Running Locally

**Prerequisites:** Node.js 18+

```sh
# Install dependencies
npm install

# Start the development server
npm run dev

# Open in browser automatically
npm run dev -- --open
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

---

## Deployment

This app is deployed on [Railway](https://railway.com?referralCode=QCz9lp) using the Node.js adapter (`@sveltejs/adapter-node`). The `railway.toml` config at the project root handles build and start commands automatically.

To deploy your own instance:

1. Fork this repo
2. Create a new project on [Railway](https://railway.com?referralCode=QCz9lp) and connect your GitHub repo
3. Railway will auto-detect the `railway.toml` and deploy on every push to `main`

---

## Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── Hero.svelte          # Page header with title and stats
│   │   ├── SearchBar.svelte     # Fuzzy search with autocomplete
│   │   ├── FilterBar.svelte     # Cuisine and city filter chips
│   │   ├── Map.svelte           # Leaflet map with clustered markers
│   │   └── RestaurantList.svelte # Scrollable restaurant cards
│   ├── data/
│   │   └── restaurants.json     # Static restaurant dataset
│   ├── stores.svelte.ts         # Svelte 5 runes-based global state
│   └── types.ts                 # TypeScript interfaces
└── routes/
    └── +page.svelte             # Main page (split map + list view)
```
