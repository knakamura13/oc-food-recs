# Technical Proposal: Enhancing Ingest Pipeline for "Mom & Pop" Integrity

## Overview
This proposal outlines a multi-layered strategy to guard the OC Food Recs dataset against national chains, international franchises, and private equity-owned restaurant groups. The goal is to ensure every restaurant in our database meets the criteria of **Independent Ownership** and **Single or Few Locations**.

## 1. Multi-Level Filtering Strategy

### Level 1: LLM Extraction (Knowledge-Based Filtering)
The first line of defense is the LLM during the extraction phase. We will update the `SYSTEM_PROMPT` in `scripts/reddit_pipeline.py` to leverage the model's internal knowledge of major brands.

**Changes:**
- Update `SYSTEM_PROMPT` to explicitly instruct the model to exclude well-known national/international chains (e.g., McDonald's, Starbucks, Din Tai Fung, The Cheesecake Factory).
- Add a "vibe check" instruction: "If a restaurant is clearly a large corporate chain, do not extract it."

### Level 2: Geocoding API (Deterministic Global Filtering)
The most reliable way to detect a chain is to count its locations globally using the Google Places API.

**Logic in `default_geocode`:**
- When geocoding a new restaurant, perform a global search (unbounded) for the restaurant's name.
- If the number of results (or specific Google "chain" markers) indicates more than 3-5 locations globally, flag it as a chain.
- Special handling for local favorites with a few locations: if the locations are concentrated within Orange County and total ≤ 3, it may still pass.

### Level 3: Parent Company Registry (Corporate Entity Filtering)
To catch groups like "Kei Concepts" (which own diverse brands like Vox Kitchen and Nep Cafe), we need a mapping of brands to corporate owners.

**Proposed Schema Additions:**
```typescript
export const parentCompanies = pgTable('parent_companies', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	name: text('name').notNull(), // e.g., "Kei Concepts"
	website: text('website'),
	isExclusionTarget: boolean('is_exclusion_target').default(true),
});

export const brandRegistry = pgTable('brand_registry', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	brandName: text('brand_name').notNull(), // e.g., "Vox Kitchen"
	parentCompanyId: bigint('parent_company_id', { mode: 'number' })
		.references(() => parentCompanies.id),
});
```

**Pipeline Integration:**
- Before final ingestion, the pipeline will check the extracted restaurant name against the `brand_registry`.
- If a match is found and the parent company is flagged for exclusion, the restaurant is marked as `excluded`.

### Level 4: Post-Processing Heuristics
A final verification step before the DB write.

**Logic:**
- **Name Normalization**: Aggressive normalization to catch variations of chain names.
- **Location Density**: If a name appears in multiple distinct cities during a single batch ingest (and hasn't been flagged), it triggers a manual review flag.

## 2. Database Schema Enhancements

To support auditing and the admin dashboard, we need to track *why* a restaurant was excluded instead of just dropping it.

**Update to `restaurants` table:**
```typescript
export const restaurants = pgTable('restaurants', {
	// ... existing fields ...
	status: text('status').default('active').notNull(), // 'active', 'excluded', 'pending_review'
	exclusionReason: text('exclusion_reason'), // 'chain', 'corporate_group', 'out_of_area'
    // ...
});
```

## 3. Implementation Plan

1.  **Registry Initialization**: Create a seed file with known exclusions (Kei Concepts brands, Din Tai Fung, Broken Yolk).
2.  **Pipeline Update**:
    - Modify `reddit_pipeline.py` to include the `parent_company` lookup.
    - Update `default_geocode` to implement the global location count check.
3.  **Schema Migration**: Apply Drizzle migrations for new tables and columns.
4.  **Admin UI (Future)**: Build a simple interface to manage the `parent_companies` and `brand_registry` tables, allowing the owner to easily "ban" new corporate groups as they appear.

## 4. Example Audit Flow
1.  **Comment**: "You have to try Vox Kitchen, it's the best!"
2.  **LLM**: Extracts "Vox Kitchen".
3.  **Registry**: Finds "Vox Kitchen" belongs to "Kei Concepts".
4.  **Ingestion**: Saves restaurant to DB with `status='excluded'` and `exclusion_reason='corporate_group'`.
5.  **Frontend**: Does not display Vox Kitchen to users.
6.  **Admin**: Sees the exclusion in the audit log and confirms the rule is working.
