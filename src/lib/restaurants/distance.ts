export interface Coordinates { lat: number; lng: number }
type MaybeCoordinates = { lat: number | null; lng: number | null };

/** Straight-line miles; null means no usable location, never zero distance. */
export function distanceMiles(origin: Coordinates | null, target: MaybeCoordinates): number | null {
	const valid = (p: MaybeCoordinates) => p.lat !== null && p.lng !== null &&
		Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
	if (!origin || !valid(origin) || !valid(target)) return null;
	const radians = Math.PI / 180;
	const dLat = (target.lat! - origin.lat) * radians;
	const dLng = (target.lng! - origin.lng) * radians;
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(origin.lat * radians) *
		Math.cos(target.lat! * radians) * Math.sin(dLng / 2) ** 2;
	return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
