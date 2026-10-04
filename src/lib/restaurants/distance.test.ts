import { describe, expect, it } from 'vitest';
import { distanceMiles } from './distance';

describe('straight-line miles', () => {
	it('measures a known arc and is symmetric', () => {
		expect(distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(69.09, 1);
		expect(distanceMiles({ lat: 0, lng: 1 }, { lat: 0, lng: 0 })).toBeCloseTo(69.09, 1);
		expect(distanceMiles({ lat: 33.7, lng: -117.8 }, { lat: 33.7, lng: -117.8 })).toBe(0);
	});
	it('returns null for missing or invalid coordinates, including no user location', () => {
		for (const target of [{ lat: null, lng: 0 }, { lat: 0, lng: null }, { lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }]) {
			expect(distanceMiles({ lat: 0, lng: 0 }, target)).toBeNull();
		}
		expect(distanceMiles(null, { lat: 0, lng: 0 })).toBeNull();
	});
	it('handles the date line and antipodes without NaN', () => {
		expect(distanceMiles({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeCloseTo(13.82, 1);
		expect(distanceMiles({ lat: 90, lng: 0 }, { lat: -90, lng: 180 })).toBeCloseTo(12436.8, 0);
	});
});
