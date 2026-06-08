# Implementation Plan - Geocoder Overhaul

Upgrade the geocoding system to use Google Places API as the primary provider, implement a database-backed cache with smart negative caching, and enable concurrent geocoding.

## Objective
- Integrate Google Places API (New) as the primary geocoder.
- Replace the JSON geocode cache with a PostgreSQL table.
- Implement "smart negative caching" to avoid redundant failing queries while allowing periodic retries.
- Enable concurrent geocoding (10+ parallel requests) to speed up ingest.
- Improve location extraction and normalization (landmarks, street-level info).
- Add a geocode health monitoring script.

## Key Files & Context
- `src/lib/server/db/schema.ts`: Define the new `geocode_cache` table.
- `scripts/reddit_pipeline.py`: Main pipeline logic, geocoding implementation, and LLM prompt.
- `scripts/regeocode.py`: Update to use the new cache and tiered logic.
- `scripts/geocode_health.py`: (New) Script for monitoring geocode performance.

## Implementation Steps

### 1. Database Schema Update
- Add `geocode_cache` table to `src/lib/server/db/schema.ts`.
- Fields: `id`, `query`, `provider`, `lat`, `lng`, `detail`, `geocoded_city`, `retry_after`, `created_at`.
- Add an index on `query`.

### 2. LLM Prompt & Address Normalization
- Update `SYSTEM_PROMPT` in `scripts/reddit_pipeline.py` to extract an optional `street` field.
- Enhance `normalize_location` with additional Orange County landmarks (e.g., "The Lab", "OC Spectrum", "South Coast Plaza").
- Update `_OC_CITIES` or landmarks to include common "hubs".

### 3. Google Places API Integration
- Implement `_google_geocode` in `scripts/reddit_pipeline.py`.
- Use the Google Places API (New) `searchText` endpoint.
- Support `locationRestriction` using `OC_BOUNDS`.
- Field mask: `places.id,places.displayName,places.formattedAddress,places.location`.

### 4. Database-Backed Geocode Cache
- Implement a `GeocodeCache` class in `scripts/reddit_pipeline.py` (or as functions) using `psycopg`.
- Logic for `get(query)`:
    - If hit and `lat` is not null: Return result.
    - If hit and `lat` is null and `retry_after > now`: Return "recently failed" (skip).
    - Else: Return None (cache miss).
- Logic for `set(query, result, provider)`:
    - If result is a hit: Store `lat`, `lng`, `detail`, `geocoded_city`.
    - If result is a miss: Store `null` lat/lng and set `retry_after` (e.g., +7 days).

### 5. Concurrent Geocoding & Tiered Logic
- Refactor `default_geocode` to:
    - Use the new DB cache.
    - Execute tiered search: Google -> Nominatim -> Mapbox.
- Update `process_restaurants` (or similar) in `scripts/reddit_pipeline.py` to use `concurrent.futures.ThreadPoolExecutor(max_workers=10)`.
- Ensure rate limiting is still respected globally or per provider if necessary (though Google's limit is high).

### 6. Geocode Health Stats
- Create `scripts/geocode_health.py`.
- Report:
    - Success rate (geocoded vs. total).
    - Provider breakdown (Google vs. Nominatim vs. Mapbox vs. Cache).
    - Top failure queries.
    - Stats on negative cache entries.

### 7. Documentation & Housekeeping
- File an issue for the "Manual correction flow (CLI/Admin)".
- File an issue for "Live geocode health stats on Admin page".
- Update `README.md` or `CLAUDE.md` with new env vars (e.g., `GOOGLE_MAPS_API_KEY`).

## Verification & Testing
- **Unit Tests**:
    - Test `normalize_location` with new landmarks.
    - Test the `GeocodeCache` logic (hit, miss, expired negative).
- **Integration Tests**:
    - Run `scripts/reddit_pipeline.py` with a sample thread (dry run).
    - Verify `geocode_cache` table is populated correctly.
- **Performance**:
    - Verify concurrent geocoding speeds up processing for threads with many restaurants.
