# Restaurant URL Strategy Plan

This document outlines approaches for adding clickable URLs to each of the 289 restaurants in the OC Food Recs list.

---

## 1. Google Maps Link Approach (No API Key)

**How it works:** Generate a Google Maps search URL from the restaurant name and city.

**URL format:**
```
https://www.google.com/maps/search/?api=1&query={name}+{city}+CA
```

**Example:**
```
https://www.google.com/maps/search/?api=1&query=El+Farolito+Placentia+CA
```

**Implementation:**
- Build a simple script (or do it inline in the Svelte component) that URL-encodes `restaurant.name + " " + restaurant.location + " CA"`.
- No API key needed. No rate limits. No cost.
- Works immediately for all 289 restaurants.

**Pros:**
- Zero cost, zero setup, zero maintenance
- Works for 100% of restaurants instantly
- Google Maps handles disambiguation well for specific name+city combos
- Links open in Google Maps (web or app on mobile)

**Cons:**
- May land on the wrong location if the restaurant name is generic or if there are multiple locations
- No control over which result Google shows
- Doesn't provide a direct "place page" URL (it's a search, not a place link)
- No additional data (website, phone, hours)

**Reliability estimate:** ~90-95% of links will land on the correct restaurant, given that we have both name and city.

---

## 2. Google Places API Approach

**How it works:** Use the Google Places API (Text Search or Find Place) to get the canonical Google Maps place ID, then build a direct place URL.

**Place URL format:**
```
https://www.google.com/maps/place/?q=place_id:{place_id}
```

**API endpoints:**
- **Find Place from Text:** `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input={name+city}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,website,formatted_phone_number,opening_hours,url`
- **Text Search:** Similar but returns multiple results for disambiguation.

**Costs (as of 2026):**
- Find Place: $17 per 1,000 requests
- Place Details: $17 per 1,000 requests (for additional fields)
- For 289 restaurants: ~$5-10 one-time cost (Find Place) + optional Details calls
- Google offers $200/month free credit, so this batch job would be free within that allowance

**Rate limits:**
- Default: 100 requests/second (more than enough for a one-time batch)

**Batch implementation:**
```javascript
// Pseudocode for batch geocoding
for (const restaurant of restaurants) {
  const query = `${restaurant.name} ${restaurant.location} CA`;
  const result = await findPlace(query);
  restaurant.place_id = result.place_id;
  restaurant.google_maps_url = result.url;       // Direct place URL
  restaurant.website = result.website;             // Official website
  restaurant.phone = result.formatted_phone_number;
  restaurant.hours = result.opening_hours;
  // Rate limit: add 100ms delay between requests
  await sleep(100);
}
```

**Pros:**
- Canonical, stable Google Maps place URLs
- Access to official website, phone number, hours, photos
- High accuracy with place ID resolution
- Can verify correctness programmatically (check returned name/address)

**Cons:**
- Requires API key setup and billing account
- Small cost (though covered by free tier for this volume)
- One-time batch job + periodic refresh needed for data freshness
- Some restaurants may not have Google Places listings (rare but possible)
- API key must be secured (restrict to server-side, not committed to repo)

---

## 3. Web Scraping Approach

### Google Search Scraping
- **Feasibility:** Technically possible but violates Google's Terms of Service
- **Risk:** IP blocks, CAPTCHAs, potential legal action
- **Verdict:** Not recommended

### Yelp Scraping
- **Feasibility:** Yelp has aggressive anti-scraping measures and explicitly prohibits it in their ToS
- **Yelp Fusion API:** Available but rate-limited (5,000 calls/day free) and doesn't provide the business's own website URL
- **Verdict:** Yelp API could supplement Google data but isn't a primary source for URLs

### General Considerations
- Web scraping is legally risky (CFAA, ToS violations)
- Brittle: page structure changes break scrapers
- Rate limiting and CAPTCHAs make it unreliable
- For 289 restaurants, the manual effort to fix scraper errors likely exceeds the effort to just use the Places API

**Verdict:** Not recommended. The Google Places API is cheap enough that scraping isn't worth the legal and maintenance risk.

---

## 4. Hybrid Approach (Recommended)

### Phase 1: Immediate (Google Maps search links)
Generate Google Maps search URLs for all restaurants right now. This can be done in the Svelte component with zero backend work:

```svelte
{@const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.name + ' ' + (restaurant.location || '') + ' CA')}`}
<a href={mapsUrl} target="_blank" rel="noopener">View on Google Maps</a>
```

**Timeline:** Can be implemented in under an hour.

### Phase 2: Enhancement (Google Places API batch)
Run a one-time batch script to:
1. Query Find Place for each restaurant
2. Store `place_id`, `google_maps_url`, `website`, `phone`, `hours`
3. Manually review any restaurants where the API returned low-confidence results
4. Commit the enriched data back to `restaurants.json`

**Timeline:** 2-4 hours including setup and manual review.

### Phase 3: Maintenance (optional)
- Re-run the batch script periodically (quarterly) to refresh hours, websites, etc.
- Add a manual override field for any restaurant where the API got it wrong
- Consider caching Places API responses to avoid re-fetching unchanged data

---

## 5. Data Structure

### Option A: Inline in restaurants.json (recommended)
Add new optional fields to each restaurant object:

```json
{
  "name": "El Farolito",
  "location": "Placentia",
  "cuisine": "Mexican",
  "aggregate_score": 155,
  "mention_count": 2,
  "lat": 33.8704662,
  "lng": -117.8711561,
  "urls": {
    "google_maps": "https://www.google.com/maps/place/?q=place_id:ChIJ...",
    "website": "https://www.elfarolitoplacentia.com",
    "phone": "(714) 555-1234",
    "place_id": "ChIJ..."
  },
  "primary_comment": { ... },
  "endorsements": [ ... ]
}
```

### Option B: Separate file
Store URL data in a separate `restaurant-urls.json` keyed by restaurant name:
```json
{
  "El Farolito": {
    "google_maps": "...",
    "website": "...",
    "place_id": "..."
  }
}
```

**Recommendation:** Option A (inline) is simpler — one file to load, one source of truth, and the TypeScript types can be extended naturally.

### TypeScript type changes
```typescript
interface RestaurantUrls {
  google_maps?: string;
  website?: string;
  phone?: string;
  place_id?: string;
}

interface Restaurant {
  // ... existing fields ...
  urls?: RestaurantUrls;
}
```

---

## 6. Recommended Approach

**Start with the hybrid approach (Section 4):**

1. **Now:** Add Google Maps search links using the simple URL construction (Phase 1). This gives users clickable links immediately with zero cost or API setup. The links will work correctly for the vast majority of restaurants.

2. **Next:** Set up a Google Cloud project, enable Places API, and run the batch enrichment script (Phase 2). This upgrades the links to canonical place URLs and adds website/phone/hours data. Total cost: $0 (within free tier). Total time: 2-4 hours.

3. **Later:** If the app grows, consider adding a "Suggest a correction" mechanism for users to flag incorrect links, and periodic data refreshes.

**Why this order:**
- Phase 1 delivers 90%+ of the user value (clickable map links) with 0% of the effort of an API integration
- Phase 2 is a nice enhancement but not critical — most users just want to find the restaurant on a map
- The Google Maps search URL approach is surprisingly robust when you have both name and specific city

**What NOT to do:**
- Don't scrape — it's legally risky and the API is cheap
- Don't build a real-time API proxy — batch the data once and commit it
- Don't over-engineer — 289 restaurants is a small, manageable dataset
