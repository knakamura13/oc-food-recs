import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { applyRestaurantMerge } from '$lib/server/restaurants/admin';
import {
	decisionSummary,
	describeProposals,
	isReportType,
	prepareReport,
	readFieldDecisions,
	type FieldKey,
	type PreparedReport,
	type ProposalView,
	type ReportInput,
	type ReportType,
	type RestaurantFacts,
} from '$lib/restaurants/report-problem';
import { db } from '$lib/server/db';
import { restaurantAliases, restaurants, visitorReports } from '$lib/server/db/schema';

export interface QueueRestaurant {
	id: number;
	name: string;
	slug: string;
	status: string;
	location: string | null;
	street: string | null;
	cuisine: string | null;
	lat: number | null;
	lng: number | null;
}

export interface QueueReport {
	id: number;
	type: ReportType;
	status: 'pending' | 'accepted' | 'dismissed';
	note: string | null;
	mapsUrl: string | null;
	createdAt: string;
	resolvedAt: string | null;
	summary: string | null;
	subjectName: string;
	restaurant: QueueRestaurant;
	proposals: ProposalView[];
	duplicate: {
		slug: string;
		name: string;
		location: string | null;
		street: string | null;
		lat: number | null;
		lng: number | null;
		available: boolean;
	} | null;
}

export interface DuplicateChoice {
	slug: string;
	name: string;
	location: string | null;
	street: string | null;
	lat: number | null;
	lng: number | null;
}

export type FileResult =
	| { result: 'filed' }
	| { result: 'already_pending' }
	| { result: 'not_found' }
	| { result: 'invalid'; error: string };

export type ResolveCommand =
	| { action: 'dismiss' }
	| { action: 'accept' }
	| { action: 'apply'; fields: Record<string, unknown> }
	| { action: 'merge'; keep: 'subject' | 'other' };

export type ResolveResult =
	| { result: 'accepted' | 'dismissed' }
	| { result: 'not_found' | 'already_resolved' }
	| { result: 'invalid'; error: string };

function iso(value: Date | string | null): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isUniqueViolation(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const record = err as { code?: string; cause?: { code?: string } };
	return record.code === '23505' || record.cause?.code === '23505';
}

function factsOf(row: QueueRestaurant): RestaurantFacts {
	return {
		name: row.name,
		location: row.location,
		street: row.street,
		cuisine: row.cuisine,
		lat: row.lat,
		lng: row.lng,
	};
}

function proposalOf(row: typeof visitorReports.$inferSelect): PreparedReport {
	return {
		note: row.note,
		name: row.proposedName,
		location: row.proposedLocation,
		street: row.proposedStreet,
		cuisine: row.proposedCuisine,
		lat: row.proposedLat,
		lng: row.proposedLng,
		mapsUrl: row.proposedMapsUrl,
		duplicateSlug: row.duplicateSlug,
	};
}

function toQueueReport(
	report: typeof visitorReports.$inferSelect,
	restaurant: QueueRestaurant,
	other: QueueRestaurant | null
): QueueReport {
	if (!isReportType(report.type)) throw new Error(`Unknown report type: ${report.type}`);
	if (report.status !== 'pending' && report.status !== 'accepted' && report.status !== 'dismissed') {
		throw new Error(`Unknown report status: ${report.status}`);
	}
	const proposal = proposalOf(report);
	return {
		id: report.id,
		type: report.type,
		status: report.status,
		note: report.note,
		mapsUrl: report.proposedMapsUrl,
		createdAt: iso(report.createdAt) ?? new Date(0).toISOString(),
		resolvedAt: iso(report.resolvedAt),
		summary:
			report.status === 'pending'
				? null
				: decisionSummary(report.type, report.status, report.fieldDecisions ?? {}),
		subjectName: report.subjectName ?? restaurant.name,
		restaurant,
		proposals: describeProposals(proposal, factsOf(restaurant)),
		duplicate: report.duplicateSlug
			? {
					slug: other?.slug ?? report.duplicateSlug,
					name: other?.name ?? report.duplicateName ?? report.duplicateSlug,
					location: other?.location ?? null,
					street: other?.street ?? null,
					lat: other?.lat ?? null,
					lng: other?.lng ?? null,
					available: other != null && other.status !== 'excluded',
				}
			: null,
	};
}

const restaurantColumns = {
	id: restaurants.id,
	name: restaurants.name,
	slug: restaurants.slug,
	status: restaurants.status,
	location: restaurants.location,
	street: restaurants.street,
	cuisine: restaurants.cuisine,
	lat: restaurants.lat,
	lng: restaurants.lng,
};

export async function fileVisitorReport(slug: string, type: string, input: ReportInput): Promise<FileResult> {
	const trimmed = slug.trim();
	if (!trimmed) return { result: 'not_found' };
	const [restaurant] = await db
		.select(restaurantColumns)
		.from(restaurants)
		.where(eq(restaurants.slug, trimmed))
		.limit(1);
	if (!restaurant || restaurant.status === 'excluded') return { result: 'not_found' };
	const prepared = prepareReport(type, input, factsOf(restaurant));
	if (!prepared.ok) return { result: 'invalid', error: prepared.error };
	const proposal = prepared.proposal;
	let duplicateRestaurantId: number | null = null;
	let duplicateName: string | null = null;
	let duplicateSlug: string | null = null;
	if (proposal.duplicateSlug) {
		if (proposal.duplicateSlug === restaurant.slug) {
			return { result: 'invalid', error: 'Choose a different restaurant.' };
		}
		const [other] = await db
			.select({ ...restaurantColumns, chainConfidence: restaurants.chainConfidence })
			.from(restaurants)
			.where(eq(restaurants.slug, proposal.duplicateSlug))
			.limit(1);
		if (!other || other.status === 'excluded' || other.chainConfidence === 'likely_chain') {
			return { result: 'invalid', error: 'Choose a restaurant that is still on the site.' };
		}
		duplicateRestaurantId = other.id;
		duplicateName = other.name;
		duplicateSlug = other.slug;
	}
	try {
		await db.insert(visitorReports).values({
			restaurantId: restaurant.id,
			type,
			note: proposal.note,
			proposedName: proposal.name,
			proposedLocation: proposal.location,
			proposedStreet: proposal.street,
			proposedCuisine: proposal.cuisine,
			proposedLat: proposal.lat,
			proposedLng: proposal.lng,
			proposedMapsUrl: proposal.mapsUrl,
			duplicateRestaurantId,
			duplicateName,
			duplicateSlug,
			subjectName: restaurant.name,
			subjectSlug: restaurant.slug,
		});
	} catch (err) {
		if (isUniqueViolation(err)) return { result: 'already_pending' };
		throw err;
	}
	return { result: 'filed' };
}

const otherRestaurant = alias(restaurants, 'report_duplicate');

const otherColumns = {
	id: otherRestaurant.id,
	name: otherRestaurant.name,
	slug: otherRestaurant.slug,
	status: otherRestaurant.status,
	location: otherRestaurant.location,
	street: otherRestaurant.street,
	cuisine: otherRestaurant.cuisine,
	lat: otherRestaurant.lat,
	lng: otherRestaurant.lng,
};

function queueFrom(
	rows: {
		report: typeof visitorReports.$inferSelect;
		restaurant: QueueRestaurant;
		duplicate: {
			id: number | null;
			name: string | null;
			slug: string | null;
			status: string | null;
			location: string | null;
			street: string | null;
			cuisine: string | null;
			lat: number | null;
			lng: number | null;
		} | null;
	}[]
) {
	return rows.map((row) => {
		const other = row.duplicate;
		const duplicate =
			other == null || other.id == null || other.name == null || other.slug == null || other.status == null
				? null
				: {
						id: other.id,
						name: other.name,
						slug: other.slug,
						status: other.status,
						location: other.location,
						street: other.street,
						cuisine: other.cuisine,
						lat: other.lat,
						lng: other.lng,
					};
		return toQueueReport(row.report, row.restaurant, duplicate);
	});
}

export async function loadVisitorReportQueue(): Promise<{ pending: QueueReport[]; recent: QueueReport[] }> {
	const pendingRows = await db
		.select({ report: visitorReports, restaurant: restaurantColumns, duplicate: otherColumns })
		.from(visitorReports)
		.innerJoin(restaurants, eq(visitorReports.restaurantId, restaurants.id))
		.leftJoin(otherRestaurant, eq(visitorReports.duplicateRestaurantId, otherRestaurant.id))
		.where(eq(visitorReports.status, 'pending'))
		.orderBy(asc(visitorReports.createdAt));
	const recentRows = await db
		.select({ report: visitorReports, restaurant: restaurantColumns, duplicate: otherColumns })
		.from(visitorReports)
		.innerJoin(restaurants, eq(visitorReports.restaurantId, restaurants.id))
		.leftJoin(otherRestaurant, eq(visitorReports.duplicateRestaurantId, otherRestaurant.id))
		.where(ne(visitorReports.status, 'pending'))
		.orderBy(desc(visitorReports.resolvedAt))
		.limit(20);
	return { pending: queueFrom(pendingRows), recent: queueFrom(recentRows) };
}

const choiceColumns = {
	slug: restaurants.slug,
	name: restaurants.name,
	location: restaurants.location,
	street: restaurants.street,
	lat: restaurants.lat,
	lng: restaurants.lng,
};

function visibleChoice(slug: string) {
	return and(
		ne(restaurants.slug, slug),
		ne(restaurants.status, 'excluded'),
		sql`COALESCE(${restaurants.chainConfidence}, 'unknown') <> 'likely_chain'`
	);
}

export async function loadReportForm(
	slug: string,
	query: string | null
): Promise<{ result: 'not_found' } | { result: 'ok'; pending: ReportType[]; nearby: DuplicateChoice[]; matches: DuplicateChoice[] }> {
	const trimmed = slug.trim();
	if (!trimmed) return { result: 'not_found' };
	const [restaurant] = await db
		.select({ ...restaurantColumns, chainConfidence: restaurants.chainConfidence })
		.from(restaurants)
		.where(eq(restaurants.slug, trimmed))
		.limit(1);
	if (!restaurant || restaurant.status === 'excluded') return { result: 'not_found' };
	const pendingRows = await db
		.select({ type: visitorReports.type })
		.from(visitorReports)
		.where(and(eq(visitorReports.restaurantId, restaurant.id), eq(visitorReports.status, 'pending')));
	const nearby =
		restaurant.lat == null || restaurant.lng == null
			? []
			: await db
					.select(choiceColumns)
					.from(restaurants)
					.where(
						and(
							visibleChoice(trimmed),
							sql`${restaurants.lat} IS NOT NULL AND abs(${restaurants.lat} - ${restaurant.lat}) < 0.0015 AND abs(${restaurants.lng} - ${restaurant.lng}) < 0.0015`
						)
					)
					.orderBy(restaurants.name)
					.limit(8);
	const safe = (query ?? '').trim().replace(/[%_\\]/g, '').slice(0, 80);
	const matches =
		safe.length < 2
			? []
			: await db
					.select(choiceColumns)
					.from(restaurants)
					.where(and(visibleChoice(trimmed), or(ilike(restaurants.name, `%${safe}%`), ilike(restaurants.slug, `%${safe}%`))))
					.orderBy(restaurants.name)
					.limit(8);
	return {
		result: 'ok',
		pending: pendingRows.flatMap((row) => (isReportType(row.type) ? [row.type] : [])),
		nearby,
		matches,
	};
}

export async function resolveVisitorReport(id: number, command: ResolveCommand): Promise<ResolveResult> {
	if (!Number.isInteger(id) || id <= 0) return { result: 'not_found' };
	return db.transaction(async (tx) => {
		const [report] = await tx.select().from(visitorReports).where(eq(visitorReports.id, id)).limit(1);
		if (!report) return { result: 'not_found' };
		if (report.status !== 'pending') return { result: 'already_resolved' };
		if (!isReportType(report.type)) return { result: 'invalid', error: 'This report has an unknown type.' };

		const pending = and(eq(visitorReports.id, id), eq(visitorReports.status, 'pending'));

		if (command.action === 'dismiss') {
			const claimed = await tx
				.update(visitorReports)
				.set({ status: 'dismissed', resolvedAt: sql`now()` })
				.where(pending)
				.returning({ id: visitorReports.id });
			return claimed.length === 0 ? { result: 'already_resolved' } : { result: 'dismissed' };
		}

		if (report.type === 'duplicate') {
			if (command.action !== 'merge') {
				return { result: 'invalid', error: 'Choose which restaurant to keep, or dismiss the report.' };
			}
			if (command.keep !== 'subject' && command.keep !== 'other') {
				return { result: 'invalid', error: 'Choose which restaurant to keep.' };
			}
			if (!report.duplicateRestaurantId) {
				return { result: 'invalid', error: 'The other restaurant is no longer available. Dismiss this report.' };
			}
			const [subject] = await tx.select().from(restaurants).where(eq(restaurants.id, report.restaurantId)).limit(1);
			const [other] = await tx
				.select()
				.from(restaurants)
				.where(eq(restaurants.id, report.duplicateRestaurantId))
				.limit(1);
			if (!subject || !other || subject.status === 'excluded' || other.status === 'excluded') {
				return { result: 'invalid', error: 'The other restaurant is no longer available. Dismiss this report.' };
			}
			const winner = command.keep === 'other' ? other : subject;
			const loser = command.keep === 'other' ? subject : other;
			const claimed = await tx
				.update(visitorReports)
				.set({
					status: 'accepted',
					fieldDecisions: { kept: winner.name },
					resolvedAt: sql`now()`,
				})
				.where(pending)
				.returning({ id: visitorReports.id });
			if (claimed.length === 0) return { result: 'already_resolved' };
			await applyRestaurantMerge(tx, winner.id, loser.id);
			return { result: 'accepted' };
		}

		if (report.type === 'closed' || report.type === 'chain') {
			if (command.action !== 'accept') {
				return { result: 'invalid', error: 'Accept hides the restaurant, or dismiss the report.' };
			}
			const claimed = await tx
				.update(visitorReports)
				.set({ status: 'accepted', resolvedAt: sql`now()` })
				.where(pending)
				.returning({ id: visitorReports.id });
			if (claimed.length === 0) return { result: 'already_resolved' };
			const reason = report.type === 'closed' ? 'closed' : 'chain';
			await tx
				.update(restaurants)
				.set({
					status: 'excluded',
					exclusionReason: reason,
					...(reason === 'closed' ? {} : { chainConfidence: 'likely_chain' as const }),
					reviewedAt: sql`now()`,
					updatedAt: sql`now()`,
				})
				.where(eq(restaurants.id, report.restaurantId));
			return { result: 'accepted' };
		}

		if (command.action !== 'apply') {
			return { result: 'invalid', error: 'Choose accept or reject for each proposed change.' };
		}
		const decision = readFieldDecisions(proposalOf(report), command.fields);
		if (!decision.ok) return { result: 'invalid' as const, error: decision.error };
		const [restaurant] = await tx
			.select()
			.from(restaurants)
			.where(eq(restaurants.id, report.restaurantId))
			.limit(1);
		if (!restaurant) return { result: 'not_found' };

		const nextStatus = decision.accepted.length === 0 ? 'dismissed' : 'accepted';
		const claimed = await tx
			.update(visitorReports)
			.set({
				status: nextStatus,
				fieldDecisions: decision.decisions,
				resolvedAt: sql`now()`,
			})
			.where(pending)
			.returning({ id: visitorReports.id });
		if (claimed.length === 0) return { result: 'already_resolved' };
		if (nextStatus === 'dismissed') return { result: 'dismissed' };

		if (decision.accepted.includes('name') && report.proposedName) {
			await tx.insert(restaurantAliases).values({
				restaurantId: restaurant.id,
				name: restaurant.name,
				location: restaurant.location,
				street: restaurant.street,
				lat: restaurant.lat,
				lng: restaurant.lng,
				source: 'visitor_report',
			});
		}

		const patch: {
			name?: string;
			location?: string;
			street?: string;
			cuisine?: string;
			lat?: number;
			lng?: number;
			reviewedAt: ReturnType<typeof sql>;
			updatedAt: ReturnType<typeof sql>;
		} = { reviewedAt: sql`now()`, updatedAt: sql`now()` };
		const accepted = new Set<FieldKey>(decision.accepted);
		if (accepted.has('name') && report.proposedName) patch.name = report.proposedName;
		if (accepted.has('location') && report.proposedLocation) patch.location = report.proposedLocation;
		if (accepted.has('street') && report.proposedStreet) patch.street = report.proposedStreet;
		if (accepted.has('cuisine') && report.proposedCuisine) patch.cuisine = report.proposedCuisine;
		if (accepted.has('pin') && report.proposedLat != null && report.proposedLng != null) {
			patch.lat = report.proposedLat;
			patch.lng = report.proposedLng;
		}
		await tx.update(restaurants).set(patch).where(eq(restaurants.id, restaurant.id));
		return { result: 'accepted' };
	});
}
