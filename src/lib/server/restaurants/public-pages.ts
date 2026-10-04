import { sourceUrl } from '$lib/restaurants/source-url';
export { sourceUrl } from '$lib/restaurants/source-url';
import { env } from '$env/dynamic/private';
import { normalizeCity, cuisineFacetKey } from '$lib/restaurants/stores.svelte';
import type { PublicRestaurant } from './public-restaurant';

export function deploymentOrigin(): string {
	const origin = env.ORIGIN || 'https://oc-food.up.railway.app';
	return new URL(origin).origin;
}
export function categorySlug(label: string): string {
	return label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
		.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
export type HubKind = 'city' | 'cuisine';
export interface PublicHub {
	kind: HubKind; label: string; labels: string[]; slug: string; indexable: boolean;
	restaurant_count: number; eligible_count: number; thread_count: number;
	lastmod: string | null; restaurants: PublicRestaurant[];
}
export function publicHubs(restaurants: PublicRestaurant[], kind: HubKind): PublicHub[] {
	const groups = new Map<string, { label: string; labels: Set<string>; members: PublicRestaurant[] }>();
	for (const restaurant of restaurants) {
		const label = kind === 'city' ? normalizeCity(restaurant.location) : restaurant.cuisine ? cuisineFacetKey(restaurant.cuisine) : null;
		if (!label || !categorySlug(label)) continue;
		const slug = categorySlug(label);
		const group = groups.get(slug);
		if (group) { group.members.push(restaurant); group.labels.add(label); if (label.localeCompare(group.label) < 0) group.label = label; }
		else groups.set(slug, { label, labels: new Set([label]), members: [restaurant] });
	}
	return [...groups].map(([slug, { label, labels, members }]) => {
		const eligible = members.filter(r => r.indexable);
		const threads = new Set(eligible.flatMap(r => r.mentions.map(m => m.thread_id)));
		const dates = members.flatMap(r => r.lastmod ? [r.lastmod] : []).sort();
		return { kind, label, labels: [...labels].sort(), slug, indexable: eligible.length >= 5 && threads.size >= 2,
			restaurant_count: members.length, eligible_count: eligible.length, thread_count: threads.size,
			lastmod: dates.at(-1) ?? null,
			restaurants: [...members].sort((a, b) => Number(b.indexable) - Number(a.indexable) || b.aggregate_score - a.aggregate_score || a.name.localeCompare(b.name)) };
	}).sort((a, b) => a.label.localeCompare(b.label));
}
export function hubExplorerUrl(hub: Pick<PublicHub, 'kind' | 'labels'>): string {
	return `/?${hub.kind}=${encodeURIComponent(hub.labels.join(','))}`;
}
export function jsonLd(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
export function restaurantStructuredData(restaurant: PublicRestaurant, origin: string) {
	const canonical = `${origin}/r/${encodeURIComponent(restaurant.slug)}`;
	return {
		'@context': 'https://schema.org', '@graph': [
			{ '@type': 'Restaurant', '@id': `${canonical}#restaurant`, name: restaurant.name, url: canonical,
				...(restaurant.cuisine ? { servesCuisine: cuisineFacetKey(restaurant.cuisine) } : {}),
				...(restaurant.street || restaurant.location ? { address: { '@type': 'PostalAddress',
					...(restaurant.street ? { streetAddress: restaurant.street } : {}),
					...(normalizeCity(restaurant.location) ? { addressLocality: normalizeCity(restaurant.location) } : {}) } } : {}),
				...(restaurant.lat !== null && restaurant.lng !== null && Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng) && Math.abs(restaurant.lat) <= 90 && Math.abs(restaurant.lng) <= 180
					? { geo: { '@type': 'GeoCoordinates', latitude: restaurant.lat, longitude: restaurant.lng } } : {}),
				review: restaurant.mentions.filter(m => m.body.trim() && m.author.trim() && !['[deleted]', '[removed]'].includes(m.author.trim()) && sourceUrl(m))
					.map(m => ({ '@type': 'Review', reviewBody: m.body, url: sourceUrl(m),
						author: { '@type': 'Person', name: m.author, url: `https://www.reddit.com/user/${encodeURIComponent(m.author)}/` },
						...(m.comment_date ? { datePublished: m.comment_date } : {}) })) },
			{ '@type': 'BreadcrumbList', itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'OC Food Recs', item: origin },
				{ '@type': 'ListItem', position: 2, name: restaurant.name, item: canonical }
			] }
		]
	};
}
export function xmlEscape(value: string): string {
	return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}
export function sitemapXml(restaurants: PublicRestaurant[], origin: string): string {
	const entries = [{ url: origin, lastmod: null }, { url: `${origin}/about`, lastmod: null },
		...restaurants.filter(r => r.indexable).map(r => ({ url: `${origin}/r/${encodeURIComponent(r.slug)}`, lastmod: r.lastmod })),
		...(['city', 'cuisine'] as const).flatMap(kind => publicHubs(restaurants, kind).filter(h => h.indexable)
			.map(h => ({ url: `${origin}/${kind}/${h.slug}`, lastmod: h.lastmod })))];
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(e => `<url><loc>${xmlEscape(e.url)}</loc>${e.lastmod ? `<lastmod>${xmlEscape(e.lastmod)}</lastmod>` : ''}</url>`).join('')}</urlset>`;
}
