export const REPORT_TYPES = ['closed', 'moved', 'wrong_detail', 'chain', 'duplicate'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const FIELD_KEYS = ['name', 'location', 'street', 'cuisine', 'pin'] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldDecision = 'accepted' | 'rejected';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
	closed: 'Closed',
	moved: 'Moved',
	wrong_detail: 'Wrong detail',
	chain: 'Chain',
	duplicate: 'Duplicate',
};

export const FIELD_LABELS: Record<FieldKey, string> = {
	name: 'Name',
	location: 'City',
	street: 'Street',
	cuisine: 'Cuisine',
	pin: 'Pin',
};

const LIMITS = {
	note: 500,
	name: 120,
	location: 80,
	street: 160,
	cuisine: 60,
	mapsUrl: 500,
} as const;

export interface RestaurantFacts {
	name: string;
	location: string | null;
	street: string | null;
	cuisine: string | null;
	lat: number | null;
	lng: number | null;
}

export interface ReportInput {
	note?: unknown;
	name?: unknown;
	location?: unknown;
	street?: unknown;
	cuisine?: unknown;
	mapsUrl?: unknown;
	duplicateSlug?: unknown;
}

export interface PreparedReport {
	note: string | null;
	name: string | null;
	location: string | null;
	street: string | null;
	cuisine: string | null;
	lat: number | null;
	lng: number | null;
	mapsUrl: string | null;
	duplicateSlug: string | null;
}

export type PrepareResult = { ok: true; proposal: PreparedReport } | { ok: false; error: string };

export interface ProposalView {
	key: FieldKey;
	label: string;
	current: string;
	proposed: string;
}

export function isReportType(value: string): value is ReportType {
	return (REPORT_TYPES as readonly string[]).includes(value);
}

function cleanText(value: unknown, max: number, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
	if (value == null || value === '') return { ok: true, value: null };
	if (typeof value !== 'string') return { ok: false, error: `${label} must be text.` };
	const trimmed = value.trim().replace(/\s+/g, ' ');
	if (!trimmed) return { ok: true, value: null };
	if (trimmed.length > max) return { ok: false, error: `${label} is too long.` };
	return { ok: true, value: trimmed };
}

function sameText(next: string | null, current: string | null): boolean {
	const left = next ?? '';
	const right = (current ?? '').trim().replace(/\s+/g, ' ');
	return left === right;
}

function inRange(lat: number, lng: number): boolean {
	return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function readPair(source: string): { lat: number; lng: number } | null {
	const place = source.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
	const at = source.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
	const match = place ?? at;
	if (!match) return null;
	const lat = Number(match[1]);
	const lng = Number(match[2]);
	return inRange(lat, lng) ? { lat, lng } : null;
}

export function parseMapsLink(raw: string): { ok: true; url: string; pin: { lat: number; lng: number } | null } | { ok: false; error: string } {
	const trimmed = raw.trim();
	if (trimmed.length > LIMITS.mapsUrl) return { ok: false, error: 'Map link is too long.' };
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return { ok: false, error: 'Map link must be a Google Maps URL.' };
	}
	if (url.protocol !== 'https:') return { ok: false, error: 'Map link must be a Google Maps URL.' };
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	const google = host === 'google.com' || host.endsWith('.google.com') || host === 'maps.google.com';
	const short = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'));
	if (!google && !short) return { ok: false, error: 'Map link must be a Google Maps URL.' };
	if (google && host !== 'maps.google.com' && !url.pathname.startsWith('/maps')) {
		return { ok: false, error: 'Map link must be a Google Maps URL.' };
	}
	const query = url.searchParams.get('q') ?? url.searchParams.get('ll');
	const queryPin = query?.match(/^(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)$/);
	const fromQuery = queryPin ? { lat: Number(queryPin[1]), lng: Number(queryPin[2]) } : null;
	const pin = readPair(url.href) ?? (fromQuery && inRange(fromQuery.lat, fromQuery.lng) ? fromQuery : null);
	return { ok: true, url: trimmed, pin };
}

function samePin(lat: number, lng: number, current: RestaurantFacts): boolean {
	if (current.lat == null || current.lng == null) return false;
	return Math.abs(current.lat - lat) < 1e-5 && Math.abs(current.lng - lng) < 1e-5;
}

function emptyProposal(note: string | null): PreparedReport {
	return {
		note,
		name: null,
		location: null,
		street: null,
		cuisine: null,
		lat: null,
		lng: null,
		mapsUrl: null,
		duplicateSlug: null,
	};
}

export function prepareReport(type: string, input: ReportInput, current: RestaurantFacts): PrepareResult {
	if (!isReportType(type)) return { ok: false, error: 'Choose the kind of problem.' };
	const note = cleanText(input.note, LIMITS.note, 'Note');
	if (!note.ok) return note;
	if (type === 'closed' || type === 'chain') return { ok: true, proposal: emptyProposal(note.value) };
	if (type === 'duplicate') {
		const other = cleanText(input.duplicateSlug, 160, 'Restaurant');
		if (!other.ok) return other;
		if (!other.value || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(other.value)) {
			return { ok: false, error: 'Choose the other restaurant.' };
		}
		const proposal = emptyProposal(note.value);
		proposal.duplicateSlug = other.value;
		return { ok: true, proposal };
	}

	const name = cleanText(input.name, LIMITS.name, 'Name');
	if (!name.ok) return name;
	const location = cleanText(input.location, LIMITS.location, 'City');
	if (!location.ok) return location;
	const street = cleanText(input.street, LIMITS.street, 'Street');
	if (!street.ok) return street;
	const cuisine = cleanText(input.cuisine, LIMITS.cuisine, 'Cuisine');
	if (!cuisine.ok) return cuisine;

	let mapsUrl: string | null = null;
	let lat: number | null = null;
	let lng: number | null = null;
	if (typeof input.mapsUrl === 'string' && input.mapsUrl.trim()) {
		const parsed = parseMapsLink(input.mapsUrl);
		if (!parsed.ok) return parsed;
		mapsUrl = parsed.url;
		if (parsed.pin && !samePin(parsed.pin.lat, parsed.pin.lng, current)) {
			lat = parsed.pin.lat;
			lng = parsed.pin.lng;
		}
	} else if (input.mapsUrl != null && input.mapsUrl !== '') {
		return { ok: false, error: 'Map link must be a Google Maps URL.' };
	}

	const proposal = emptyProposal(note.value);
	proposal.mapsUrl = mapsUrl;
	if (type === 'wrong_detail') {
		if (name.value && !sameText(name.value, current.name)) proposal.name = name.value;
		if (location.value && !sameText(location.value, current.location)) proposal.location = location.value;
		if (street.value && !sameText(street.value, current.street)) proposal.street = street.value;
		if (cuisine.value && !sameText(cuisine.value, current.cuisine)) proposal.cuisine = cuisine.value;
		if (lat != null && lng != null) {
			proposal.lat = lat;
			proposal.lng = lng;
		}
		if (!proposal.name && !proposal.location && !proposal.street && !proposal.cuisine && proposal.lat == null) {
			if (mapsUrl && lat == null) return { ok: false, error: 'That Maps link has no pin to apply.' };
			return { ok: false, error: 'Change at least one detail.' };
		}
		return { ok: true, proposal };
	}

	if (location.value && !sameText(location.value, current.location)) proposal.location = location.value;
	if (street.value && !sameText(street.value, current.street)) proposal.street = street.value;
	if (lat != null && lng != null) {
		proposal.lat = lat;
		proposal.lng = lng;
	}
	if (!proposal.location && !proposal.street && proposal.lat == null) {
		if (mapsUrl) return { ok: false, error: 'That Maps link has no pin. Add the new city or street.' };
		return { ok: false, error: 'Add the new city, street, or a Maps link with a pin.' };
	}
	return { ok: true, proposal };
}

export function proposalFieldKeys(proposal: Pick<PreparedReport, 'name' | 'location' | 'street' | 'cuisine' | 'lat' | 'lng'>): FieldKey[] {
	const keys: FieldKey[] = [];
	if (proposal.name) keys.push('name');
	if (proposal.location) keys.push('location');
	if (proposal.street) keys.push('street');
	if (proposal.cuisine) keys.push('cuisine');
	if (proposal.lat != null && proposal.lng != null) keys.push('pin');
	return keys;
}

export function formatPin(lat: number | null, lng: number | null): string {
	if (lat == null || lng == null) return 'None';
	return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function describeProposals(
	proposal: PreparedReport,
	current: RestaurantFacts
): ProposalView[] {
	return proposalFieldKeys(proposal).map((key) => {
		if (key === 'pin') {
			return {
				key,
				label: FIELD_LABELS.pin,
				current: formatPin(current.lat, current.lng),
				proposed: formatPin(proposal.lat, proposal.lng),
			};
		}
		const proposed = proposal[key];
		const currentValue = key === 'name' ? current.name : current[key];
		return {
			key,
			label: FIELD_LABELS[key],
			current: currentValue?.trim() ? currentValue : 'None',
			proposed: proposed ?? 'None',
		};
	});
}

export function readFieldDecisions(
	proposal: Pick<PreparedReport, 'name' | 'location' | 'street' | 'cuisine' | 'lat' | 'lng'>,
	input: Record<string, unknown>
): { ok: true; decisions: Record<FieldKey, FieldDecision>; accepted: FieldKey[] } | { ok: false; error: string } {
	const keys = proposalFieldKeys(proposal);
	const decisions = {} as Record<FieldKey, FieldDecision>;
	for (const key of keys) {
		const value = input[key];
		if (value !== 'accepted' && value !== 'rejected') {
			return { ok: false, error: `Choose accept or reject for ${FIELD_LABELS[key]}.` };
		}
		decisions[key] = value;
	}
	return { ok: true, decisions, accepted: keys.filter((key) => decisions[key] === 'accepted') };
}

export function decisionSummary(
	type: ReportType,
	status: 'accepted' | 'dismissed',
	decisions: Record<string, string>
): string {
	if (type === 'closed' || type === 'chain') {
		if (status === 'dismissed') return 'Dismissed. Restaurant unchanged.';
		return type === 'closed' ? 'Hidden. Reason: closed.' : 'Hidden. Reason: chain.';
	}
	if (type === 'duplicate') {
		if (status === 'dismissed') return 'Dismissed. Both restaurants stay on the site.';
		return decisions.kept ? `Kept ${decisions.kept}.` : 'Merged.';
	}
	const parts = proposalDecisionPhrases(decisions);
	if (status === 'dismissed') {
		return parts.length > 0 ? `Dismissed. ${parts.join('. ')}.` : 'Dismissed. Restaurant unchanged.';
	}
	return parts.length > 0 ? parts.join('. ') + '.' : 'Accepted.';
}

function proposalDecisionPhrases(decisions: Record<string, string>): string[] {
	const phrases: string[] = [];
	for (const key of FIELD_KEYS) {
		const decision = decisions[key];
		if (decision !== 'accepted' && decision !== 'rejected') continue;
		phrases.push(`${FIELD_LABELS[key]} ${decision}`);
	}
	return phrases;
}
