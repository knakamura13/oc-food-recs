import { describe, expect, it } from 'vitest';
import {
	buildGeocodeCacheKey,
	isInOcBounds,
	parseGoogleMapsUrl,
	parseLatLngInput
} from './admin';

describe('buildGeocodeCacheKey', () => {
	it('joins name, street, and location in lowercase', () => {
		expect(buildGeocodeCacheKey("Porto's", 'Santa Ana', 'Main St')).toBe(
			"porto's|main st|santa ana"
		);
	});

	it('omits empty street', () => {
		expect(buildGeocodeCacheKey('Pops', 'Santa Ana', null)).toBe('pops|santa ana');
	});
});

describe('parseLatLngInput', () => {
	it('parses comma-separated coordinates', () => {
		expect(parseLatLngInput('33.7456, -117.8678')).toEqual({ lat: 33.7456, lng: -117.8678 });
	});

	it('parses space-separated coordinates', () => {
		expect(parseLatLngInput('33.7456 -117.8678')).toEqual({ lat: 33.7456, lng: -117.8678 });
	});

	it('returns null for invalid input', () => {
		expect(parseLatLngInput('not coords')).toBeNull();
	});
});

describe('parseGoogleMapsUrl', () => {
	it('extracts coordinates from @lat,lng format', () => {
		expect(
			parseGoogleMapsUrl('https://www.google.com/maps/@33.7456,-117.8678,17z')
		).toEqual({ lat: 33.7456, lng: -117.8678 });
	});

	it('extracts coordinates from !3d/!4d format', () => {
		expect(
			parseGoogleMapsUrl(
				'https://www.google.com/maps/place/foo/@33.1,-118.0,12z/data=!3d33.7456!4d-117.8678'
			)
		).toEqual({ lat: 33.7456, lng: -117.8678 });
	});

	it('extracts coordinates from q= query param', () => {
		expect(
			parseGoogleMapsUrl('https://maps.google.com/?q=33.7456,-117.8678')
		).toEqual({ lat: 33.7456, lng: -117.8678 });
	});
});

describe('isInOcBounds', () => {
	it('accepts coordinates inside Orange County', () => {
		expect(isInOcBounds(33.7456, -117.8678)).toBe(true);
	});

	it('rejects coordinates outside Orange County', () => {
		expect(isInOcBounds(34.05, -118.25)).toBe(false);
	});
});
