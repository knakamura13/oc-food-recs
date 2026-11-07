import { describe, expect, it } from 'vitest';
import {
	decisionSummary,
	describeProposals,
	parseMapsLink,
	prepareReport,
	readFieldDecisions,
	type RestaurantFacts,
} from './report-problem';

const current: RestaurantFacts = {
	name: 'La Taco Spot',
	location: 'Santa Ana',
	street: '1 Main St',
	cuisine: 'Mexican',
	lat: 33.7455,
	lng: -117.8677,
};

describe('prepareReport', () => {
	it('stores a closure without proposed fields', () => {
		const result = prepareReport('closed', { note: '  Lights off  ' }, current);
		expect(result).toEqual({
			ok: true,
			proposal: {
				note: 'Lights off',
				name: null,
				location: null,
				street: null,
				cuisine: null,
				lat: null,
				lng: null,
				mapsUrl: null,
				duplicateSlug: null,
			},
		});
	});

	it('drops unchanged details and keeps a changed name and pin', () => {
		const result = prepareReport(
			'wrong_detail',
			{
				name: 'La Taco Spot',
				location: 'Santa Ana',
				street: '1 Main St',
				cuisine: 'Tacos',
				mapsUrl: 'https://www.google.com/maps/place/La/@33.75000,-117.87000,17z',
			},
			current
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.proposal.cuisine).toBe('Tacos');
		expect(result.proposal.name).toBeNull();
		expect(result.proposal.lat).toBeCloseTo(33.75);
		expect(result.proposal.lng).toBeCloseTo(-117.87);
	});

	it('rejects a wrong-detail report that changes nothing', () => {
		const result = prepareReport('wrong_detail', { name: 'La Taco Spot', cuisine: 'Mexican' }, current);
		expect(result).toEqual({ ok: false, error: 'Change at least one detail.' });
	});

	it('accepts a move with a new street and ignores a short map link without a pin', () => {
		const result = prepareReport(
			'moved',
			{ street: '9 New St', mapsUrl: 'https://maps.app.goo.gl/abc' },
			current
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.proposal.street).toBe('9 New St');
		expect(result.proposal.lat).toBeNull();
		expect(result.proposal.mapsUrl).toBe('https://maps.app.goo.gl/abc');
	});

	it('rejects a non-Google map link', () => {
		expect(parseMapsLink('https://example.com/maps')).toEqual({
			ok: false,
			error: 'Map link must be a Google Maps URL.',
		});
	});

	it('reads a q= pin', () => {
		const parsed = parseMapsLink('https://www.google.com/maps?q=33.70000,-117.80000');
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.pin).toEqual({ lat: 33.7, lng: -117.8 });
	});
});

describe('field decisions', () => {
	it('requires a choice for every proposed field and can accept one', () => {
		const prepared = prepareReport('wrong_detail', { name: 'Taco Spot', cuisine: 'Tacos' }, current);
		expect(prepared.ok).toBe(true);
		if (!prepared.ok) return;
		expect(readFieldDecisions(prepared.proposal, { name: 'accepted' })).toEqual({
			ok: false,
			error: 'Choose accept or reject for Cuisine.',
		});
		const decision = readFieldDecisions(prepared.proposal, { name: 'accepted', cuisine: 'rejected' });
		expect(decision.ok).toBe(true);
		if (!decision.ok) return;
		expect(decision.accepted).toEqual(['name']);
		expect(describeProposals(prepared.proposal, current).map((item) => item.label)).toEqual(['Name', 'Cuisine']);
		expect(decisionSummary('wrong_detail', 'accepted', decision.decisions)).toBe('Name accepted. Cuisine rejected.');
	});

	it('requires the other restaurant for a duplicate report', () => {
		expect(prepareReport('duplicate', {}, current)).toEqual({ ok: false, error: 'Choose the other restaurant.' });
		const result = prepareReport('duplicate', { duplicateSlug: 'papa-johns' }, current);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.proposal.duplicateSlug).toBe('papa-johns');
		expect(decisionSummary('duplicate', 'accepted', { kept: "Papa John's" })).toBe("Kept Papa John's.");
		expect(decisionSummary('duplicate', 'dismissed', {})).toBe('Dismissed. Both restaurants stay on the site.');
	});

	it('requires the other restaurant for a duplicate report', () => {
		expect(prepareReport('duplicate', {}, current)).toEqual({ ok: false, error: 'Choose the other restaurant.' });
		const result = prepareReport('duplicate', { duplicateSlug: 'papa-johns', note: 'Same pin' }, current);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.proposal.duplicateSlug).toBe('papa-johns');
		expect(decisionSummary('duplicate', 'accepted', { kept: "Papa John's" })).toBe("Kept Papa John's.");
		expect(decisionSummary('duplicate', 'dismissed', {})).toBe('Dismissed. Both restaurants stay on the site.');
	});

	it('describes a chain hide', () => {
		expect(decisionSummary('chain', 'accepted', {})).toBe('Hidden. Reason: chain.');
		expect(decisionSummary('closed', 'dismissed', {})).toBe('Dismissed. Restaurant unchanged.');
	});
});
