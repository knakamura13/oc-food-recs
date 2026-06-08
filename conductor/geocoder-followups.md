# Geocoder Overhaul - Follow-up Tasks

This file tracks the remaining tasks and future enhancements for the geocoding system after the Google Places API integration.

## High Priority
- [ ] **Manual Correction Flow**: Implement a CLI tool or Admin UI route to manually correct geocoding failures.
    - Should display "unresolved" restaurants from the database.
    - Should allow providing a Google Maps URL, address, or direct lat/lng.
    - Should update the `geocode_cache` and the `restaurants` table.
- [ ] **Live Health Stats**: Add a "Geocode Health" tab to the Admin dashboard.
    - Visualize success rates, provider breakdown, and failure hotspots.
    - Leverage the logic in `scripts/geocode_health.py`.

## Enhancements
- [ ] **Street Column in DB**: Add a `street` column to the `restaurants` table to persist extracted street/cross-street info for future re-geocoding.
- [ ] **Advanced Fuzzy Matching**: Integrate `rapidfuzz` for more robust name matching in `_name_score` and `is_match`.
- [ ] **Geocode Cache Management UI**: Allow admins to clear specific cache entries or force retries on negative cache hits.
